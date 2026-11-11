CREATE TABLE IF NOT EXISTS tower_users (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username text NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9][a-z0-9_-]{2,31}$'),
    password_hash bytea NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tower_sessions (
    token_hash bytea PRIMARY KEY CHECK (octet_length(token_hash) = 32),
    user_id bigint NOT NULL REFERENCES tower_users(id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS tower_sessions_expiry ON tower_sessions (expires_at);

CREATE TABLE IF NOT EXISTS tower_saves (
    user_id bigint PRIMARY KEY REFERENCES tower_users(id) ON DELETE CASCADE,
    version bigint NOT NULL CHECK (version BETWEEN 1 AND 9007199254740991),
    state jsonb NOT NULL CHECK (jsonb_typeof(state) = 'object'),
    updated_at timestamptz NOT NULL DEFAULT now()
);
