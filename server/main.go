package main

import (
	"context"
	"database/sql"
	_ "embed"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"
)

//go:embed migrations/001_initial.sql
var initialMigration string

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}

func run() error {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		return errors.New("set DATABASE_URL to a PostgreSQL connection string")
	}
	db, err := openDatabase(databaseURL)
	if err != nil {
		return err
	}
	defer db.Close()

	origin, err := configuredOrigin(os.Getenv("APP_ORIGIN"))
	if err != nil {
		return err
	}
	staticDir, err := findStaticDir(os.Getenv("STATIC_DIR"))
	if err != nil {
		return err
	}
	app, err := newApp(db, origin)
	if err != nil {
		return err
	}

	setupCtx, cancelSetup := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancelSetup()
	if err := migrate(setupCtx, db); err != nil {
		return fmt.Errorf("initialize PostgreSQL schema: %w", err)
	}

	addr := os.Getenv("ADDR")
	if addr == "" {
		addr = ":8080"
	}
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		return err
	}
	server := &http.Server{
		Handler:           app.routes(staticDir),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      20 * time.Second,
		IdleTimeout:       time.Minute,
	}
	log.Printf("Crystal Tower listening on %s, static directory %s", listener.Addr(), staticDir)

	stopCtx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	stopped := make(chan error, 1)
	go func() { stopped <- server.Serve(listener) }()
	select {
	case err := <-stopped:
		return err
	case <-stopCtx.Done():
		shutdownCtx, cancelShutdown := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancelShutdown()
		return server.Shutdown(shutdownCtx)
	}
}

func openDatabase(databaseURL string) (*sql.DB, error) {
	config, err := pgx.ParseConfig(databaseURL)
	if err != nil {
		return nil, errors.New("DATABASE_URL is not a valid PostgreSQL connection string")
	}
	db := stdlib.OpenDB(*config)
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(30 * time.Minute)
	return db, nil
}

func migrate(ctx context.Context, db *sql.DB) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(927608102)`); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, initialMigration); err != nil {
		return err
	}
	return tx.Commit()
}

func configuredOrigin(raw string) (*url.URL, error) {
	if raw == "" {
		return nil, nil
	}
	origin, err := url.Parse(raw)
	if err != nil || (origin.Scheme != "http" && origin.Scheme != "https") || origin.Hostname() == "" ||
		origin.User != nil || origin.RawQuery != "" || origin.ForceQuery || origin.Fragment != "" ||
		(origin.Path != "" && origin.Path != "/") {
		return nil, errors.New("APP_ORIGIN must be an http:// or https:// origin with no path, query, or fragment")
	}
	origin.Path = ""
	return origin, nil
}

func findStaticDir(configured string) (string, error) {
	candidates := []string{configured}
	if configured == "" {
		candidates = []string{"dist", "../dist"}
	}
	for _, dir := range candidates {
		info, err := os.Stat(filepath.Join(dir, "index.html"))
		if err == nil && info.Mode().IsRegular() {
			return filepath.Abs(dir)
		}
	}
	return "", fmt.Errorf("index.html not found in %s; run npm run build or set STATIC_DIR", strings.Join(candidates, " or "))
}
