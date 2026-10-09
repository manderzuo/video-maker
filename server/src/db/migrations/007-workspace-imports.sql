CREATE TABLE workspace_imports (
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 id uuid NOT NULL,
 idempotency_key uuid NOT NULL,
 export_id uuid NOT NULL,
 fingerprint text NOT NULL,
 document jsonb NOT NULL,
 state text NOT NULL CHECK(state IN ('staged','committed')),
 mapping jsonb,
 reserved_bytes bigint NOT NULL CHECK(reserved_bytes>=0),
 created_at timestamptz NOT NULL,
 committed_at timestamptz,
 PRIMARY KEY(user_id,id),
 UNIQUE(user_id,idempotency_key),
 UNIQUE(user_id,export_id)
);
CREATE TABLE workspace_import_files (
 user_id uuid NOT NULL,
 batch_id uuid NOT NULL,
 id uuid NOT NULL,
 manifest jsonb NOT NULL,
 uploaded boolean NOT NULL DEFAULT false,
 PRIMARY KEY(user_id,id),
 UNIQUE(user_id,batch_id,manifest),
 FOREIGN KEY(user_id,batch_id) REFERENCES workspace_imports(user_id,id) ON DELETE CASCADE
);
