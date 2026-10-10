CREATE TABLE workspace_content (
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('prompt','draft')),
 revision integer NOT NULL CHECK(revision>=0),
 document jsonb NOT NULL,
 created_at timestamptz NOT NULL,
 updated_at timestamptz NOT NULL,
 trashed_at timestamptz,
 PRIMARY KEY(user_id,id),
 CHECK(document->>'id'=id::text),
 CHECK((document->>'revision')::integer=revision)
);
CREATE INDEX workspace_content_owner_kind_idx ON workspace_content(user_id,kind,updated_at DESC);
CREATE TABLE workspace_content_versions (
 user_id uuid NOT NULL,
 id uuid NOT NULL,
 revision integer NOT NULL,
 document jsonb NOT NULL,
 created_at timestamptz NOT NULL,
 PRIMARY KEY(user_id,id,revision),
 FOREIGN KEY(user_id,id) REFERENCES workspace_content(user_id,id) ON DELETE CASCADE
);
CREATE TABLE workspace_content_assets (
 user_id uuid NOT NULL,
 content_id uuid NOT NULL,
 asset_id uuid NOT NULL,
 PRIMARY KEY(user_id,content_id,asset_id),
 FOREIGN KEY(user_id,content_id) REFERENCES workspace_content(user_id,id) ON DELETE CASCADE,
 FOREIGN KEY(user_id,asset_id) REFERENCES workspace_assets(user_id,id)
);
CREATE TABLE workspace_content_creations (
 user_id uuid NOT NULL,
 id uuid NOT NULL,
 content_id uuid NOT NULL,
 fingerprint text NOT NULL,
 PRIMARY KEY(user_id,id),
 FOREIGN KEY(user_id,content_id) REFERENCES workspace_content(user_id,id) ON DELETE CASCADE
);
CREATE TABLE workspace_tasks (
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 id uuid NOT NULL,
 draft_id uuid NOT NULL,
 config_id uuid NOT NULL,
 secret_version integer NOT NULL,
 frozen_config jsonb NOT NULL,
 request_body text NOT NULL,
 document jsonb NOT NULL,
 result_snapshot jsonb,
 lease_until timestamptz,
 created_at timestamptz NOT NULL,
 updated_at timestamptz NOT NULL,
 PRIMARY KEY(user_id,id),
 FOREIGN KEY(user_id,draft_id) REFERENCES workspace_content(user_id,id),
 FOREIGN KEY(config_id,user_id) REFERENCES api_configs(id,user_id),
 FOREIGN KEY(config_id,secret_version) REFERENCES api_secret_versions(config_id,secret_version),
 CHECK(document->>'id'=id::text)
);
CREATE INDEX workspace_tasks_pending_idx ON workspace_tasks((document->>'executionState'),created_at);
CREATE TABLE workspace_prompt_previews (
 user_id uuid NOT NULL,
 id uuid NOT NULL,
 draft_id uuid NOT NULL,
 document jsonb NOT NULL,
 frozen_config jsonb NOT NULL,
 request_body text NOT NULL,
 task_id uuid,
 PRIMARY KEY(user_id,id),
 FOREIGN KEY(user_id,draft_id) REFERENCES workspace_content(user_id,id),
 FOREIGN KEY(user_id,task_id) REFERENCES workspace_tasks(user_id,id)
);
CREATE TABLE workspace_task_archives (
 user_id uuid NOT NULL,
 id uuid NOT NULL,
 project_id uuid NOT NULL,
 source_task_id uuid NOT NULL,
 document jsonb NOT NULL,
 PRIMARY KEY(user_id,id),
 FOREIGN KEY(user_id,project_id) REFERENCES workspace_projects(user_id,id),
 CHECK(document->>'id'=id::text),
 CHECK(document->>'historical'='true')
);
