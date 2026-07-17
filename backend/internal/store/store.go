package store

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"embed"
	"encoding/hex"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

//go:embed migrations/*.sql
var migrationFiles embed.FS

type Store struct {
	db      *sql.DB
	writeMu sync.Mutex
}

func Open(ctx context.Context, path string) (*Store, error) {
	if strings.TrimSpace(path) == "" {
		return nil, errors.New("database path is empty")
	}
	parent := filepath.Dir(path)
	if err := os.MkdirAll(parent, 0o750); err != nil {
		return nil, fmt.Errorf("create database directory: %w", err)
	}
	info, err := os.Stat(parent)
	if err != nil {
		return nil, fmt.Errorf("stat database directory: %w", err)
	}
	if !info.IsDir() {
		return nil, errors.New("database parent is not a directory")
	}

	// modernc sqlite applies _pragma parameters whenever database/sql opens a
	// connection, rather than only to the first connection in the pool.
	dsn := "file:" + filepath.ToSlash(path) + "?_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)&_pragma=synchronous(NORMAL)"
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}
	db.SetMaxOpenConns(4)
	db.SetMaxIdleConns(4)

	s := &Store{db: db}
	if err := s.initialize(ctx); err != nil {
		db.Close()
		return nil, err
	}
	return s, nil
}

func (s *Store) initialize(ctx context.Context) error {
	var journal string
	if err := s.db.QueryRowContext(ctx, "PRAGMA journal_mode = WAL").Scan(&journal); err != nil {
		return fmt.Errorf("enable WAL: %w", err)
	}
	if !strings.EqualFold(journal, "wal") {
		return fmt.Errorf("verify journal_mode: got %q", journal)
	}
	var synchronous, busyTimeout, foreignKeys int
	if err := s.db.QueryRowContext(ctx, "PRAGMA synchronous").Scan(&synchronous); err != nil || synchronous != 1 {
		return fmt.Errorf("verify synchronous NORMAL: value=%d: %w", synchronous, err)
	}
	if err := s.db.QueryRowContext(ctx, "PRAGMA busy_timeout").Scan(&busyTimeout); err != nil || busyTimeout != 5000 {
		return fmt.Errorf("verify busy_timeout: value=%d: %w", busyTimeout, err)
	}
	if err := s.db.QueryRowContext(ctx, "PRAGMA foreign_keys").Scan(&foreignKeys); err != nil || foreignKeys != 1 {
		return fmt.Errorf("verify foreign_keys: value=%d: %w", foreignKeys, err)
	}
	if err := s.migrate(ctx); err != nil {
		return fmt.Errorf("migrate database: %w", err)
	}
	return nil
}

func (s *Store) Close() error { return s.db.Close() }

func (s *Store) Ping(ctx context.Context) error { return s.db.PingContext(ctx) }

func (s *Store) WithWriteLock(fn func(*sql.DB) error) error {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	return fn(s.db)
}

func (s *Store) migrate(ctx context.Context) error {
	entries, err := fs.Glob(migrationFiles, "migrations/*.sql")
	if err != nil {
		return err
	}
	sort.Strings(entries)
	migrations := make([]migrationSource, 0, len(entries))
	for _, name := range entries {
		body, err := migrationFiles.ReadFile(name)
		if err != nil {
			return err
		}
		sum := sha256.Sum256(body)
		migrations = append(migrations, migrationSource{version: filepath.Base(name), checksum: hex.EncodeToString(sum[:]), body: string(body)})
	}

	exists, err := tableExists(ctx, s.db, "schema_migrations")
	if err != nil {
		return err
	}
	applied := make(map[string]string)
	if exists {
		rows, err := s.db.QueryContext(ctx, "SELECT version, checksum FROM schema_migrations")
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var version, checksum string
			if err := rows.Scan(&version, &checksum); err != nil {
				return err
			}
			applied[version] = checksum
		}
		if err := rows.Err(); err != nil {
			return err
		}
	}

	return applyPendingMigrations(ctx, s.db, migrations, applied)
}

type migrationSource struct {
	version  string
	checksum string
	body     string
}

func applyPendingMigrations(ctx context.Context, db *sql.DB, migrations []migrationSource, applied map[string]string) error {
	for _, migration := range migrations {
		if previous, ok := applied[migration.version]; ok && previous != migration.checksum {
			return fmt.Errorf("migration checksum mismatch: %s", migration.version)
		}
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, migration := range migrations {
		if _, ok := applied[migration.version]; ok {
			continue
		}
		if _, err := tx.ExecContext(ctx, migration.body); err != nil {
			return fmt.Errorf("apply %s: %w", migration.version, err)
		}
		if _, err := tx.ExecContext(ctx, "INSERT INTO schema_migrations(version, checksum, applied_at) VALUES (?, ?, ?)", migration.version, migration.checksum, time.Now().UTC().UnixMilli()); err != nil {
			return fmt.Errorf("record %s: %w", migration.version, err)
		}
	}
	return tx.Commit()
}

func tableExists(ctx context.Context, db *sql.DB, name string) (bool, error) {
	var one int
	err := db.QueryRowContext(ctx, "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", name).Scan(&one)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	return err == nil, err
}
