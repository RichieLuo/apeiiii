package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"log"
	"mime"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"golang.org/x/crypto/bcrypt"
)

const (
	sessionCookie = "tower_session"
	sessionTTL    = 30 * 24 * time.Hour
	maxSaveBytes  = 2 << 20
	maxVersion    = 9007199254740991
)

var usernamePattern = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]{2,31}$`)

type app struct {
	db        *sql.DB
	origin    *url.URL
	dummyHash []byte
	hashSlots chan struct{}
	authLimit struct {
		sync.Mutex
		minute int64
		byIP   map[string]int
	}
}

func newApp(db *sql.DB, origin *url.URL) (*app, error) {
	dummyHash, err := bcrypt.GenerateFromPassword([]byte("invalid-account-placeholder"), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}
	return &app{db: db, origin: origin, dummyHash: dummyHash, hashSlots: make(chan struct{}, 4)}, nil
}

func (a *app) routes(staticDir string) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/auth/register", a.api(a.register, http.MethodPost))
	mux.HandleFunc("/api/auth/login", a.api(a.login, http.MethodPost))
	mux.HandleFunc("/api/auth/logout", a.api(a.logout, http.MethodPost))
	mux.HandleFunc("/api/auth/session", a.api(a.session, http.MethodGet))
	mux.HandleFunc("/api/save", a.api(a.save, http.MethodGet, http.MethodPut))
	notFound := func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		fail(w, http.StatusNotFound, "not_found", "接口不存在")
	}
	mux.HandleFunc("/api", notFound)
	mux.HandleFunc("/api/", notFound)
	if staticDir != "" {
		mux.Handle("/", http.FileServer(http.Dir(staticDir)))
	}
	return mux
}

func (a *app) api(handler http.HandlerFunc, methods ...string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		if !slices.Contains(methods, r.Method) {
			w.Header().Set("Allow", strings.Join(methods, ", "))
			fail(w, http.StatusMethodNotAllowed, "method_not_allowed", "此接口不接受该请求方法")
			return
		}
		if r.Method != http.MethodGet && !a.sameOrigin(r) {
			fail(w, http.StatusForbidden, "invalid_origin", "请从游戏页面发起请求")
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
		defer cancel()
		handler(w, r.WithContext(ctx))
	}
}

func (a *app) sameOrigin(r *http.Request) bool {
	if r.Header.Get("Sec-Fetch-Site") == "cross-site" {
		return false
	}
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true
	}
	if a.origin != nil {
		return strings.EqualFold(origin, a.origin.String())
	}
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	return strings.EqualFold(origin, scheme+"://"+r.Host)
}

func (a *app) allowAuth(r *http.Request) bool {
	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		ip = r.RemoteAddr
	}
	minute := time.Now().Unix() / 60
	a.authLimit.Lock()
	defer a.authLimit.Unlock()
	if a.authLimit.byIP == nil || a.authLimit.minute != minute {
		a.authLimit.minute = minute
		a.authLimit.byIP = make(map[string]int)
	}
	count := a.authLimit.byIP[ip]
	if count >= 30 || (count == 0 && len(a.authLimit.byIP) >= 4096) {
		return false
	}
	a.authLimit.byIP[ip]++
	return true
}

type credentials struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func (a *app) authenticate(w http.ResponseWriter, r *http.Request, create bool) {
	var input credentials
	if !readJSON(w, r, &input, 4096) {
		return
	}
	input.Username = strings.ToLower(strings.TrimSpace(input.Username))
	if !usernamePattern.MatchString(input.Username) || len(input.Password) < 8 || len(input.Password) > 72 {
		if create {
			fail(w, http.StatusBadRequest, "invalid_credentials", "用户名需为 3–32 位字母、数字、下划线或连字符，密码需为 8–72 字节")
		} else {
			fail(w, http.StatusUnauthorized, "invalid_credentials", "用户名或密码错误")
		}
		return
	}
	if !a.allowAuth(r) {
		w.Header().Set("Retry-After", "60")
		fail(w, http.StatusTooManyRequests, "too_many_attempts", "尝试过于频繁，请稍后重试")
		return
	}
	select {
	case a.hashSlots <- struct{}{}:
		defer func() { <-a.hashSlots }()
	default:
		w.Header().Set("Retry-After", "1")
		fail(w, http.StatusTooManyRequests, "too_many_attempts", "登录请求较多，请稍后重试")
		return
	}

	ctx := r.Context()
	var userID int64
	var hash []byte
	if create {
		var err error
		hash, err = bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
		if err != nil {
			internalError(w, "hash password", err)
			return
		}
	} else {
		err := a.db.QueryRowContext(ctx, `SELECT id, password_hash FROM tower_users WHERE username = $1`, input.Username).Scan(&userID, &hash)
		missing := errors.Is(err, sql.ErrNoRows)
		if err != nil && !missing {
			internalError(w, "find user", err)
			return
		}
		if missing {
			hash = a.dummyHash
		}
		if bcrypt.CompareHashAndPassword(hash, []byte(input.Password)) != nil || missing {
			fail(w, http.StatusUnauthorized, "invalid_credentials", "用户名或密码错误")
			return
		}
	}

	tx, err := a.db.BeginTx(ctx, nil)
	if err != nil {
		internalError(w, "start session transaction", err)
		return
	}
	defer tx.Rollback()
	status := http.StatusOK
	if create {
		err = tx.QueryRowContext(ctx, `INSERT INTO tower_users (username, password_hash) VALUES ($1, $2)
			ON CONFLICT (username) DO NOTHING RETURNING id`, input.Username, hash).Scan(&userID)
		if errors.Is(err, sql.ErrNoRows) {
			fail(w, http.StatusConflict, "username_taken", "此用户名已被注册")
			return
		}
		if err != nil {
			internalError(w, "register user", err)
			return
		}
		status = http.StatusCreated
	}
	token, expires, err := createSession(ctx, tx, userID, cookieHash(r))
	if err == nil {
		err = tx.Commit()
	}
	if err != nil {
		internalError(w, "create session", err)
		return
	}
	a.setCookie(w, r, token, expires, int(sessionTTL.Seconds()))
	writeJSON(w, status, usernameResponse{Username: input.Username})
}

func (a *app) register(w http.ResponseWriter, r *http.Request) { a.authenticate(w, r, true) }

func (a *app) login(w http.ResponseWriter, r *http.Request) { a.authenticate(w, r, false) }

func createSession(ctx context.Context, tx *sql.Tx, userID int64, previous []byte) (string, time.Time, error) {
	var secret [32]byte
	if _, err := rand.Read(secret[:]); err != nil {
		return "", time.Time{}, err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM tower_sessions WHERE expires_at <= now() OR token_hash = $1`, previous); err != nil {
		return "", time.Time{}, err
	}
	hash := sha256.Sum256(secret[:])
	expires := time.Now().UTC().Add(sessionTTL)
	_, err := tx.ExecContext(ctx, `INSERT INTO tower_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)`, hash[:], userID, expires)
	return base64.RawURLEncoding.EncodeToString(secret[:]), expires, err
}

func cookieHash(r *http.Request) []byte {
	cookie, err := r.Cookie(sessionCookie)
	if err != nil || len(cookie.Value) != base64.RawURLEncoding.EncodedLen(32) {
		return nil
	}
	secret, err := base64.RawURLEncoding.Strict().DecodeString(cookie.Value)
	if err != nil || len(secret) != 32 {
		return nil
	}
	hash := sha256.Sum256(secret)
	return hash[:]
}

func (a *app) setCookie(w http.ResponseWriter, r *http.Request, value string, expires time.Time, maxAge int) {
	secure := r.TLS != nil || (a.origin != nil && a.origin.Scheme == "https")
	http.SetCookie(w, &http.Cookie{
		Name: sessionCookie, Value: value, Path: "/", Expires: expires, MaxAge: maxAge,
		HttpOnly: true, Secure: secure, SameSite: http.SameSiteStrictMode,
	})
}

type usernameResponse struct {
	Username string `json:"username"`
}

func (a *app) currentUser(w http.ResponseWriter, r *http.Request) (int64, string, bool) {
	hash := cookieHash(r)
	if hash == nil {
		fail(w, http.StatusUnauthorized, "not_signed_in", "请先登录")
		return 0, "", false
	}
	var id int64
	var username string
	err := a.db.QueryRowContext(r.Context(), `SELECT u.id, u.username FROM tower_sessions s
		JOIN tower_users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > now()`, hash).Scan(&id, &username)
	if errors.Is(err, sql.ErrNoRows) {
		fail(w, http.StatusUnauthorized, "not_signed_in", "登录已失效，请重新登录")
		return 0, "", false
	}
	if err != nil {
		internalError(w, "read session", err)
		return 0, "", false
	}
	return id, username, true
}

func (a *app) session(w http.ResponseWriter, r *http.Request) {
	_, username, ok := a.currentUser(w, r)
	if ok {
		writeJSON(w, http.StatusOK, usernameResponse{Username: username})
	}
}

func (a *app) logout(w http.ResponseWriter, r *http.Request) {
	if hash := cookieHash(r); hash != nil {
		if _, err := a.db.ExecContext(r.Context(), `DELETE FROM tower_sessions WHERE token_hash = $1`, hash); err != nil {
			internalError(w, "delete session", err)
			return
		}
	}
	a.setCookie(w, r, "", time.Unix(0, 0).UTC(), -1)
	w.WriteHeader(http.StatusNoContent)
}

type saveResponse struct {
	Version   int64           `json:"version"`
	State     json.RawMessage `json:"state"`
	UpdatedAt *time.Time      `json:"updatedAt"`
}

type saveVersion struct {
	Version   int64     `json:"version"`
	UpdatedAt time.Time `json:"updatedAt"`
}

func (a *app) save(w http.ResponseWriter, r *http.Request) {
	userID, username, ok := a.currentUser(w, r)
	if !ok {
		return
	}
	if expected := r.Header.Get("X-Save-Account"); expected != "" && expected != username {
		fail(w, http.StatusUnauthorized, "account_changed", "登录账号已切换，请重新打开云存档")
		return
	}
	if r.Method == http.MethodGet {
		a.getSave(w, r, userID)
	} else {
		a.putSave(w, r, userID)
	}
}

func (a *app) getSave(w http.ResponseWriter, r *http.Request, userID int64) {
	var response saveResponse
	var state []byte
	var updated time.Time
	err := a.db.QueryRowContext(r.Context(), `SELECT version, state, updated_at FROM tower_saves WHERE user_id = $1`, userID).
		Scan(&response.Version, &state, &updated)
	if err == nil {
		updated = updated.UTC()
		response.State, response.UpdatedAt = json.RawMessage(state), &updated
	} else if !errors.Is(err, sql.ErrNoRows) {
		internalError(w, "read cloud save", err)
		return
	}
	writeJSON(w, http.StatusOK, response)
}

func (a *app) putSave(w http.ResponseWriter, r *http.Request, userID int64) {
	var input struct {
		Version *int64          `json:"version"`
		State   json.RawMessage `json:"state"`
	}
	if !readJSON(w, r, &input, maxSaveBytes) {
		return
	}
	if input.Version == nil || *input.Version < 0 || *input.Version >= maxVersion || !validSave(input.State) {
		fail(w, http.StatusBadRequest, "invalid_save", "存档结构或版本无效")
		return
	}
	version := *input.Version
	ctx := r.Context()
	var row *sql.Row
	if version == 0 {
		row = a.db.QueryRowContext(ctx, `INSERT INTO tower_saves (user_id, version, state) VALUES ($1, 1, $2::jsonb)
			ON CONFLICT (user_id) DO NOTHING RETURNING version, updated_at`, userID, string(input.State))
	} else {
		row = a.db.QueryRowContext(ctx, `UPDATE tower_saves SET version = version + 1, state = $3::jsonb, updated_at = now()
			WHERE user_id = $1 AND version = $2 RETURNING version, updated_at`, userID, version, string(input.State))
	}
	var response saveVersion
	err := row.Scan(&response.Version, &response.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		var current int64
		err := a.db.QueryRowContext(ctx, `SELECT version FROM tower_saves WHERE user_id = $1`, userID).Scan(&current)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			internalError(w, "read current save version", err)
			return
		}
		writeJSON(w, http.StatusConflict, struct {
			apiError
			Version int64 `json:"version"`
		}{apiError{"save_conflict", "云存档已更新，请先读取最新版本"}, current})
		return
	}
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && strings.HasPrefix(pgErr.Code, "22") {
			fail(w, http.StatusBadRequest, "invalid_save", "存档含有无法保存的数据")
			return
		}
		internalError(w, "write cloud save", err)
		return
	}
	response.UpdatedAt = response.UpdatedAt.UTC()
	writeJSON(w, http.StatusOK, response)
}

func validSave(raw json.RawMessage) bool {
	var state struct {
		SchemaVersion int             `json:"schemaVersion"`
		Resources     json.RawMessage `json:"resources"`
		Floors        json.RawMessage `json:"floors"`
		Units         json.RawMessage `json:"units"`
	}
	return json.Unmarshal(raw, &state) == nil && state.SchemaVersion > 0 &&
		bytes.HasPrefix(state.Resources, []byte("{")) && bytes.HasPrefix(state.Floors, []byte("{")) &&
		bytes.HasPrefix(state.Units, []byte("["))
}

func readJSON(w http.ResponseWriter, r *http.Request, dst any, limit int64) bool {
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || mediaType != "application/json" {
		fail(w, http.StatusUnsupportedMediaType, "invalid_content_type", "请以 JSON 格式发送请求")
		return false
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, limit))
	decoder.DisallowUnknownFields()
	err = decoder.Decode(dst)
	if err == nil {
		var extra json.RawMessage
		err = decoder.Decode(&extra)
		if errors.Is(err, io.EOF) {
			return true
		}
	}
	var tooLarge *http.MaxBytesError
	if errors.As(err, &tooLarge) {
		fail(w, http.StatusRequestEntityTooLarge, "body_too_large", "请求数据过大")
		return false
	}
	fail(w, http.StatusBadRequest, "invalid_json", "JSON 请求格式无效")
	return false
}

type apiError struct {
	Error   string `json:"error"`
	Message string `json:"message"`
}

func fail(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, apiError{Error: code, Message: message})
}

func internalError(w http.ResponseWriter, operation string, err error) {
	log.Printf("%s: %v", operation, err)
	fail(w, http.StatusInternalServerError, "server_error", "服务器暂时无法处理请求")
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
