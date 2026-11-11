package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"
)

func TestCookieAndOrigin(t *testing.T) {
	origin, err := configuredOrigin("https://tower.example/")
	if err != nil {
		t.Fatal(err)
	}
	a := &app{origin: origin}
	r := httptest.NewRequest(http.MethodPost, "http://127.0.0.1:8080/api/auth/logout", nil)
	r.Header.Set("Origin", "https://tower.example")
	if !a.sameOrigin(r) {
		t.Fatal("configured HTTPS proxy origin was rejected")
	}
	w := httptest.NewRecorder()
	a.setCookie(w, r, "opaque-token", time.Now().Add(time.Hour), 3600)
	cookie := w.Result().Cookies()[0]
	if !cookie.Secure || !cookie.HttpOnly || cookie.SameSite != http.SameSiteStrictMode || cookie.Path != "/" || cookie.Domain != "" {
		t.Fatal("cookie flags missing")
	}
	r.Header.Set("Origin", "https://unrelated.example")
	if a.sameOrigin(r) {
		t.Fatal("unexpected origin was accepted")
	}
}

func TestCloudSavePostgres(t *testing.T) {
	connection := os.Getenv("TEST_DATABASE_URL")
	if connection == "" {
		t.Skip("set TEST_DATABASE_URL to an isolated PostgreSQL database to run this test")
	}
	db, err := openDatabase(connection)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	for range 2 {
		if err := migrate(ctx, db); err != nil {
			t.Fatalf("migrate: %v", err)
		}
	}
	username := fmt.Sprintf("tower-%d", time.Now().UnixNano())
	other := username + "-b"
	defer db.Exec(`DELETE FROM tower_users WHERE username IN ($1, $2)`, username, other)
	a, err := newApp(db, nil)
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(a.routes(""))
	defer server.Close()
	base, _ := url.Parse(server.URL)
	client := func() *http.Client {
		jar, err := cookiejar.New(nil)
		if err != nil {
			t.Fatal(err)
		}
		return &http.Client{Jar: jar, Timeout: 5 * time.Second}
	}
	first, second, third := client(), client(), client()
	const password = "testing-password-01"
	cred := func(name, pw string) string { return fmt.Sprintf(`{"username":%q,"password":%q}`, name, pw) }
	request := func(client *http.Client, method, path, body, account, origin string) (int, []byte, error) {
		req, err := http.NewRequest(method, server.URL+path, strings.NewReader(body))
		if err != nil {
			return 0, nil, err
		}
		if body != "" {
			req.Header.Set("Content-Type", "application/json")
		}
		req.Header.Set("X-Save-Account", account)
		req.Header.Set("Origin", origin)
		response, err := client.Do(req)
		if err != nil {
			return 0, nil, err
		}
		defer response.Body.Close()
		data, err := io.ReadAll(response.Body)
		return response.StatusCode, data, err
	}
	call := func(client *http.Client, method, path, body, account, origin string, status int, contains string) {
		t.Helper()
		got, data, err := request(client, method, path, body, account, origin)
		if err != nil || got != status || !strings.Contains(string(data), contains) {
			t.Fatalf("%s %s got %d %s %v, want %d containing %q", method, path, got, data, err, status, contains)
		}
	}
	call(first, "GET", "/api/save", "", "", "", 401, "not_signed_in")
	call(first, "POST", "/api/auth/register", cred(username, password), "", "https://foreign.example", 403, "invalid_origin")
	call(first, "POST", "/api/auth/register", cred(" "+strings.ToUpper(username)+" ", password), "", server.URL, 201, username)
	call(first, "GET", "/api/auth/session", "", "", "", 200, username)
	call(first, "GET", "/api/save", "", username, "", 200, `"version":0,"state":null,"updatedAt":null`)
	call(second, "POST", "/api/auth/register", cred(username, password), "", server.URL, 409, "username_taken")
	call(second, "POST", "/api/auth/login", cred(username, "password-wrong"), "", server.URL, 401, "invalid_credentials")
	call(second, "POST", "/api/auth/login", cred(username, password), "", server.URL, 200, username)
	call(first, "PUT", "/api/save", `{"state":{}}`, username, server.URL, 400, "invalid_save")
	call(first, "PUT", "/api/save", `{"version":0,"state":{}}`+strings.Repeat(" ", maxSaveBytes), username, server.URL, 413, "body_too_large")

	save := func(version, gold int) string {
		return fmt.Sprintf(`{"version":%d,"state":{"schemaVersion":1,"resources":{"gold":%d},"floors":{},"units":[]}}`, version, gold)
	}
	for _, version := range []int{0, 1} {
		type outcome struct {
			status int
			body   []byte
			err    error
		}
		outcomes := make(chan outcome, 2)
		for i, client := range []*http.Client{first, second} {
			go func() {
				status, body, err := request(client, "PUT", "/api/save", save(version, i+1), username, server.URL)
				outcomes <- outcome{status, body, err}
			}()
		}
		statuses := map[int]int{}
		for range 2 {
			result := <-outcomes
			statuses[result.status]++
			var payload struct {
				Version int `json:"version"`
			}
			if result.err != nil || json.Unmarshal(result.body, &payload) != nil || payload.Version != version+1 {
				t.Fatalf("unexpected concurrent write result: %d %s %v", result.status, result.body, result.err)
			}
		}
		if statuses[200] != 1 || statuses[409] != 1 {
			t.Fatalf("expected one writer and one conflict, got %v", statuses)
		}
	}
	call(second, "GET", "/api/save", "", username, "", 200, `"version":2`)
	oldCookie := first.Jar.Cookies(base)[0]
	call(first, "POST", "/api/auth/register", cred(other, password), "", server.URL, 201, other)
	third.Jar.SetCookies(base, []*http.Cookie{oldCookie})
	call(third, "GET", "/api/auth/session", "", "", "", 401, "not_signed_in")
	call(first, "PUT", "/api/save", save(0, 99), username, server.URL, 401, "account_changed")
	call(first, "GET", "/api/save", "", other, "", 200, `"version":0,"state":null`)
	call(first, "POST", "/api/auth/logout", "", "", server.URL, 204, "")
	call(first, "GET", "/api/auth/session", "", "", "", 401, "not_signed_in")
	call(second, "GET", "/api/save", "", username, "", 200, `"version":2`)
}
