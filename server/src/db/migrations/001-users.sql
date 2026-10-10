CREATE TABLE users (
 id uuid PRIMARY KEY, username text NOT NULL, username_key text NOT NULL UNIQUE,
 password_hash text NOT NULL, created_at timestamptz NOT NULL
);
CREATE TABLE user_documents (
 id uuid PRIMARY KEY, user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
 revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
 onboarding_completed_at timestamptz, preferences jsonb NOT NULL,
 last_visited_page text NOT NULL DEFAULT '/projects'
);
CREATE TABLE preauth_sessions (
 token_digest text PRIMARY KEY CHECK (token_digest ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz NOT NULL
);
CREATE TABLE sessions (
 token_digest text PRIMARY KEY CHECK (token_digest ~ '^[a-f0-9]{64}$'),
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 context_id text NOT NULL UNIQUE, created_at timestamptz NOT NULL,
 last_seen_at timestamptz NOT NULL, expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_user_id_idx ON sessions(user_id);
CREATE TABLE auth_rate_limits (
 key_digest text PRIMARY KEY, hits integer NOT NULL CHECK (hits >= 0),
 expires_at timestamptz NOT NULL
);
