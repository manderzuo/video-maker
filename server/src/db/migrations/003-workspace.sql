CREATE TABLE workspace_projects (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 revision integer NOT NULL CHECK (revision >= 0),
 document jsonb NOT NULL,
 created_at timestamptz NOT NULL,
 updated_at timestamptz NOT NULL,
 trashed_at timestamptz,
 UNIQUE (user_id,id,revision),
 UNIQUE (user_id,id),
 CHECK (document->>'id'=id::text),
 CHECK ((document->>'revision')::integer=revision)
);
CREATE INDEX workspace_projects_owner_updated_idx ON workspace_projects(user_id,updated_at DESC,id);

CREATE TABLE workspace_command_receipts (
 user_id uuid NOT NULL,
 id uuid NOT NULL,
 project_id uuid NOT NULL,
 revision integer NOT NULL CHECK (revision > 0),
 fingerprint text NOT NULL,
 before_graph jsonb NOT NULL,
 after_graph jsonb NOT NULL,
 command_type text NOT NULL CHECK(command_type IN ('operations','undo','redo','viewport')),
 created_at timestamptz NOT NULL,
 PRIMARY KEY (user_id,id),
 FOREIGN KEY (user_id,project_id) REFERENCES workspace_projects(user_id,id) ON DELETE CASCADE
);
CREATE TABLE workspace_command_history (
 user_id uuid NOT NULL,
 project_id uuid NOT NULL,
 undo_stack uuid[] NOT NULL DEFAULT '{}',
 redo_stack uuid[] NOT NULL DEFAULT '{}',
 PRIMARY KEY (user_id,project_id),
 FOREIGN KEY (user_id,project_id) REFERENCES workspace_projects(user_id,id) ON DELETE CASCADE
);

CREATE TABLE workspace_graphs (
 user_id uuid NOT NULL,
 project_id uuid NOT NULL,
 revision integer NOT NULL CHECK (revision >= 0),
 graph jsonb NOT NULL,
 PRIMARY KEY (user_id,project_id),
 FOREIGN KEY (user_id,project_id,revision)
   REFERENCES workspace_projects(user_id,id,revision)
   ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
 CHECK (graph->>'projectId'=project_id::text),
 CHECK ((graph->>'revision')::integer=revision)
);

CREATE TABLE workspace_assets (
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 id uuid NOT NULL,
 state text NOT NULL CHECK(state IN ('pending','complete')),
 document jsonb NOT NULL,
 thumbnail jsonb,
 sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
 bytes bigint NOT NULL CHECK(bytes>0),
 reserved_bytes bigint NOT NULL CHECK(reserved_bytes>=bytes),
 created_at timestamptz NOT NULL,
 trashed_at timestamptz,
 PRIMARY KEY(user_id,id)
);
CREATE UNIQUE INDEX workspace_assets_owner_hash_idx ON workspace_assets(user_id,sha256) WHERE state='complete' AND trashed_at IS NULL;
CREATE TABLE workspace_asset_references (
 user_id uuid NOT NULL,
 project_id uuid NOT NULL,
 asset_id uuid NOT NULL,
 source_id text NOT NULL,
 PRIMARY KEY(user_id,project_id,asset_id,source_id),
 FOREIGN KEY(user_id,project_id) REFERENCES workspace_projects(user_id,id) ON DELETE CASCADE,
 FOREIGN KEY(user_id,asset_id) REFERENCES workspace_assets(user_id,id)
);
