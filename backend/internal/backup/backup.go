package backup

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/hayatky/ambient-lapis/backend/internal/store"
)

const (
	dailyKeep   = 14
	weeklyKeep  = 8
	monthlyKeep = 12
)

var backupName = map[string]*regexp.Regexp{
	"daily":   regexp.MustCompile(`^ambient-lapis-[0-9]{8}\.sqlite3$`),
	"weekly":  regexp.MustCompile(`^ambient-lapis-[0-9]{8}\.sqlite3$`),
	"monthly": regexp.MustCompile(`^ambient-lapis-[0-9]{6}\.sqlite3$`),
}

type Manager struct {
	Store    *store.Store
	Dir      string
	Location *time.Location
}

type Result struct {
	DailyPath   string
	WeeklyPath  string
	MonthlyPath string
	Pruned      []string
}

func (m *Manager) Ready() error {
	if m.Store == nil {
		return errors.New("backup store is nil")
	}
	if strings.TrimSpace(m.Dir) == "" {
		return errors.New("backup directory is empty")
	}
	if err := os.MkdirAll(m.Dir, 0o750); err != nil {
		return fmt.Errorf("create backup directory: %w", err)
	}
	probe, err := os.CreateTemp(m.Dir, ".write-probe-*")
	if err != nil {
		return fmt.Errorf("backup directory is not writable: %w", err)
	}
	name := probe.Name()
	if err := probe.Close(); err != nil {
		return err
	}
	if err := os.Remove(name); err != nil {
		return err
	}
	return nil
}

func (m *Manager) HasDaily(now time.Time) (bool, error) {
	location := m.location()
	name := "ambient-lapis-" + now.In(location).Format("20060102") + ".sqlite3"
	info, err := os.Lstat(filepath.Join(m.Dir, "daily", name))
	if errors.Is(err, fs.ErrNotExist) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if !info.Mode().IsRegular() {
		return false, nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := integrityCheck(ctx, filepath.Join(m.Dir, "daily", name)); err != nil {
		return false, nil
	}
	return true, nil
}

// Create makes one verified SQLite snapshot, atomically publishes it as the
// daily generation, and derives weekly/monthly generations from that exact
// snapshot. It serializes VACUUM INTO with collection writes through Store.
func (m *Manager) Create(ctx context.Context, now time.Time) (Result, error) {
	var result Result
	if err := m.Ready(); err != nil {
		return result, err
	}
	for _, class := range []string{"daily", "weekly", "monthly"} {
		if err := os.MkdirAll(filepath.Join(m.Dir, class), 0o750); err != nil {
			return result, fmt.Errorf("create %s directory: %w", class, err)
		}
	}
	temp, err := os.CreateTemp(m.Dir, ".ambient-lapis-vacuum-*.sqlite3")
	if err != nil {
		return result, err
	}
	tempPath := temp.Name()
	if err := temp.Close(); err != nil {
		return result, err
	}
	if err := os.Remove(tempPath); err != nil {
		return result, err
	}
	defer os.Remove(tempPath)

	err = m.Store.WithWriteLock(func(db *sql.DB) error {
		_, err := db.ExecContext(ctx, "VACUUM INTO ?", tempPath)
		return err
	})
	if err != nil {
		return result, fmt.Errorf("vacuum backup: %w", err)
	}
	if err := syncFile(tempPath); err != nil {
		return result, fmt.Errorf("sync backup: %w", err)
	}
	if err := integrityCheck(ctx, tempPath); err != nil {
		return result, err
	}

	local := now.In(m.location())
	dailyName := "ambient-lapis-" + local.Format("20060102") + ".sqlite3"
	result.DailyPath = filepath.Join(m.Dir, "daily", dailyName)
	if err := atomicCopy(tempPath, result.DailyPath); err != nil {
		return Result{}, fmt.Errorf("publish daily backup: %w", err)
	}
	if local.Weekday() == time.Sunday {
		result.WeeklyPath = filepath.Join(m.Dir, "weekly", dailyName)
		if err := atomicCopy(result.DailyPath, result.WeeklyPath); err != nil {
			return Result{}, fmt.Errorf("publish weekly backup: %w", err)
		}
	}
	if local.Day() == 1 {
		result.MonthlyPath = filepath.Join(m.Dir, "monthly", "ambient-lapis-"+local.Format("200601")+".sqlite3")
		if err := atomicCopy(result.DailyPath, result.MonthlyPath); err != nil {
			return Result{}, fmt.Errorf("publish monthly backup: %w", err)
		}
	}

	for class, keep := range map[string]int{"daily": dailyKeep, "weekly": weeklyKeep, "monthly": monthlyKeep} {
		pruned, err := prune(filepath.Join(m.Dir, class), class, keep)
		if err != nil {
			return result, fmt.Errorf("prune %s backups: %w", class, err)
		}
		result.Pruned = append(result.Pruned, pruned...)
	}
	return result, nil
}

func (m *Manager) location() *time.Location {
	if m.Location != nil {
		return m.Location
	}
	return time.UTC
}

func integrityCheck(ctx context.Context, path string) error {
	db, err := sql.Open("sqlite", "file:"+filepath.ToSlash(path)+"?mode=ro&_pragma=query_only(1)")
	if err != nil {
		return err
	}
	defer db.Close()
	rows, err := db.QueryContext(ctx, "PRAGMA integrity_check")
	if err != nil {
		return fmt.Errorf("backup integrity check: %w", err)
	}
	defer rows.Close()
	var messages []string
	for rows.Next() {
		var message string
		if err := rows.Scan(&message); err != nil {
			return err
		}
		messages = append(messages, message)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if len(messages) != 1 || messages[0] != "ok" {
		return fmt.Errorf("backup integrity check failed: %s", strings.Join(messages, "; "))
	}
	return nil
}

func atomicCopy(source, destination string) error {
	dir := filepath.Dir(destination)
	temp, err := os.CreateTemp(dir, ".backup-publish-*")
	if err != nil {
		return err
	}
	tempPath := temp.Name()
	ok := false
	defer func() {
		temp.Close()
		if !ok {
			os.Remove(tempPath)
		}
	}()
	src, err := os.Open(source)
	if err != nil {
		return err
	}
	defer src.Close()
	if _, err := io.Copy(temp, src); err != nil {
		return err
	}
	if err := temp.Sync(); err != nil {
		return err
	}
	if err := temp.Close(); err != nil {
		return err
	}
	if err := os.Chmod(tempPath, 0o640); err != nil {
		return err
	}
	if err := os.Rename(tempPath, destination); err != nil {
		return err
	}
	ok = true
	return syncDir(dir)
}

func syncFile(path string) error {
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()
	return file.Sync()
}

func syncDir(path string) error {
	dir, err := os.Open(path)
	if err != nil {
		return err
	}
	defer dir.Close()
	return dir.Sync()
}

func prune(dir, class string, keep int) ([]string, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	var names []string
	for _, entry := range entries {
		if entry.Type()&os.ModeSymlink != 0 || !backupName[class].MatchString(entry.Name()) {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			return nil, err
		}
		if info.Mode().IsRegular() {
			names = append(names, entry.Name())
		}
	}
	sort.Sort(sort.Reverse(sort.StringSlice(names)))
	var removed []string
	if len(names) <= keep {
		return removed, nil
	}
	for _, name := range names[keep:] {
		path := filepath.Join(dir, name)
		if err := os.Remove(path); err != nil {
			return removed, err
		}
		removed = append(removed, path)
	}
	if len(removed) > 0 {
		if err := syncDir(dir); err != nil {
			return removed, err
		}
	}
	return removed, nil
}
