CREATE TABLE api_configs (
 id uuid NOT NULL UNIQUE, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 channel text NOT NULL CHECK (channel IN ('video','text')),
 api_base text NOT NULL, model text NOT NULL, revision integer NOT NULL CHECK (revision > 0),
 active_secret_version integer NOT NULL CHECK (active_secret_version > 0), updated_at timestamptz NOT NULL,
 PRIMARY KEY (user_id,channel), UNIQUE (id,user_id)
);
CREATE TABLE api_secret_versions (
 config_id uuid NOT NULL, user_id uuid NOT NULL, secret_version integer NOT NULL CHECK (secret_version > 0),
 key_version text NOT NULL, nonce bytea NOT NULL CHECK (octet_length(nonce)=12),
 ciphertext bytea NOT NULL, tag bytea NOT NULL CHECK (octet_length(tag)=16),
 created_at timestamptz NOT NULL,
 PRIMARY KEY (config_id,secret_version),
 FOREIGN KEY (config_id,user_id) REFERENCES api_configs(id,user_id) ON DELETE CASCADE
);
