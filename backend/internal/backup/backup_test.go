package backup

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/hayatky/ambient-lapis/backend/internal/store"
)

func TestCreateVerifiedGenerations(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	s, err := store.Open(ctx, filepath.Join(root, "data", "app.sqlite3"))
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	now := time.Date(2026, 2, 1, 3, 15, 0, 0, time.FixedZone("JST", 9*60*60)) // Sunday and first day.
	run, err := s.StartCollectionRun(ctx, now)
	if err != nil {
		t.Fatal(err)
	}
	value := 21.5
	if err := s.SaveEnvironment(ctx, store.EnvironmentSample{RunID: run, DeviceID: "fixture-device", FetchedAt: now, TemperatureC: &value}); err != nil {
		t.Fatal(err)
	}
	if err := s.CompleteCollectionRun(ctx, run, store.OverallPartial, now.Add(time.Second)); err != nil {
		t.Fatal(err)
	}
	m := Manager{Store: s, Dir: filepath.Join(root, "backups"), Location: now.Location()}
	dailyDir := filepath.Join(m.Dir, "daily")
	if err := os.MkdirAll(dailyDir, 0o750); err != nil {
		t.Fatal(err)
	}
	existingDaily := filepath.Join(dailyDir, "ambient-lapis-20260201.sqlite3")
	if err := os.WriteFile(existingDaily, []byte("corrupt previous generation"), 0o640); err != nil {
		t.Fatal(err)
	}
	result, err := m.Create(ctx, now)
	if err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{result.DailyPath, result.WeeklyPath, result.MonthlyPath} {
		if info, err := os.Lstat(path); err != nil || !info.Mode().IsRegular() {
			t.Fatalf("backup %q: info=%v err=%v", path, info, err)
		}
		if err := integrityCheck(ctx, path); err != nil {
			t.Fatal(err)
		}
	}
	if ok, err := m.HasDaily(now); err != nil || !ok {
		t.Fatalf("has daily=%v err=%v", ok, err)
	}
	restorePath := filepath.Join(root, "restore", "restored.sqlite3")
	if err := os.MkdirAll(filepath.Dir(restorePath), 0o750); err != nil {
		t.Fatal(err)
	}
	if err := atomicCopy(result.DailyPath, restorePath); err != nil {
		t.Fatal(err)
	}
	restored, err := store.Open(ctx, restorePath)
	if err != nil {
		t.Fatal(err)
	}
	defer restored.Close()
	current, err := restored.Current(ctx, "fixture-device", "fixture-aircon")
	if err != nil || current.Environment == nil || current.Environment.TemperatureC == nil || *current.Environment.TemperatureC != value {
		t.Fatalf("restored current=%#v err=%v", current, err)
	}
	status, err := restored.Status(ctx)
	if err != nil || status.LastRun == nil || status.LastRun.OverallStatus != store.OverallPartial {
		t.Fatalf("restored status=%#v err=%v", status, err)
	}
}

func TestHasDailyRejectsCorruptFile(t *testing.T) {
	root := t.TempDir()
	now := time.Date(2026, 7, 18, 3, 15, 0, 0, time.UTC)
	daily := filepath.Join(root, "daily")
	if err := os.MkdirAll(daily, 0o750); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(daily, "ambient-lapis-20260718.sqlite3"), []byte("not sqlite"), 0o640); err != nil {
		t.Fatal(err)
	}
	m := Manager{Dir: root, Location: time.UTC}
	if ok, err := m.HasDaily(now); err != nil || ok {
		t.Fatalf("corrupt daily accepted: ok=%v err=%v", ok, err)
	}
}

func TestCreateCleansVacuumTempAfterFailure(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	s, err := store.Open(ctx, filepath.Join(root, "data", "app.sqlite3"))
	if err != nil {
		t.Fatal(err)
	}
	if err := s.Close(); err != nil {
		t.Fatal(err)
	}
	m := Manager{Store: s, Dir: filepath.Join(root, "backups"), Location: time.UTC}
	if _, err := m.Create(ctx, time.Date(2026, 7, 18, 3, 15, 0, 0, time.UTC)); err == nil {
		t.Fatal("expected closed database failure")
	}
	matches, err := filepath.Glob(filepath.Join(m.Dir, ".ambient-lapis-vacuum-*"))
	if err != nil {
		t.Fatal(err)
	}
	if len(matches) != 0 {
		t.Fatalf("vacuum temp files leaked: %v", matches)
	}
}

func TestPruneKeepsNewestAndIgnoresUnknownAndSymlink(t *testing.T) {
	dir := t.TempDir()
	for day := 1; day <= 16; day++ {
		name := filepath.Join(dir, "ambient-lapis-202607"+twoDigits(day)+".sqlite3")
		if err := os.WriteFile(name, []byte("fixture"), 0o640); err != nil {
			t.Fatal(err)
		}
	}
	unknown := filepath.Join(dir, "notes.txt")
	if err := os.WriteFile(unknown, []byte("keep"), 0o640); err != nil {
		t.Fatal(err)
	}
	target := filepath.Join(dir, "target")
	if err := os.WriteFile(target, []byte("keep"), 0o640); err != nil {
		t.Fatal(err)
	}
	symlink := filepath.Join(dir, "ambient-lapis-20260101.sqlite3")
	if err := os.Symlink(target, symlink); err != nil {
		t.Fatal(err)
	}
	removed, err := prune(dir, "daily", 14)
	if err != nil {
		t.Fatal(err)
	}
	if len(removed) != 2 {
		t.Fatalf("removed=%v", removed)
	}
	if _, err := os.Lstat(unknown); err != nil {
		t.Fatal("unknown file was removed")
	}
	if info, err := os.Lstat(symlink); err != nil || info.Mode().Type()&os.ModeSymlink == 0 {
		t.Fatal("symlink was followed or removed")
	}
}

func TestRetentionCounts(t *testing.T) {
	tests := []struct {
		class  string
		keep   int
		prefix string
	}{
		{class: "daily", keep: 14, prefix: "202601"},
		{class: "weekly", keep: 8, prefix: "202601"},
		{class: "monthly", keep: 12, prefix: "2026"},
	}
	for _, test := range tests {
		t.Run(test.class, func(t *testing.T) {
			dir := t.TempDir()
			for value := 1; value <= test.keep+3; value++ {
				name := filepath.Join(dir, "ambient-lapis-"+test.prefix+twoDigits(value)+".sqlite3")
				if err := os.WriteFile(name, []byte("fixture"), 0o640); err != nil {
					t.Fatal(err)
				}
			}
			removed, err := prune(dir, test.class, test.keep)
			if err != nil {
				t.Fatal(err)
			}
			if len(removed) != 3 {
				t.Fatalf("removed=%d want=3", len(removed))
			}
			entries, err := os.ReadDir(dir)
			if err != nil {
				t.Fatal(err)
			}
			if len(entries) != test.keep {
				t.Fatalf("remaining=%d want=%d", len(entries), test.keep)
			}
		})
	}
}

func twoDigits(value int) string {
	return string([]byte{'0' + byte(value/10), '0' + byte(value%10)})
}
