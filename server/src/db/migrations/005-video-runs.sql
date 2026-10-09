CREATE TABLE workspace_video_previews (
 user_id uuid NOT NULL,
 id uuid NOT NULL,
 project_id uuid NOT NULL,
 document jsonb NOT NULL,
 frozen_config jsonb NOT NULL,
 frozen_contract jsonb NOT NULL,
 consumed_runs uuid[],
 PRIMARY KEY(user_id,id),
 FOREIGN KEY(user_id,project_id) REFERENCES workspace_projects(user_id,id)
);
CREATE TABLE workspace_video_runs (
 user_id uuid NOT NULL,
 id uuid NOT NULL,
 project_id uuid NOT NULL,
 config_id uuid NOT NULL,
 secret_version integer NOT NULL,
 frozen_config jsonb NOT NULL,
 frozen_contract jsonb NOT NULL,
 document jsonb NOT NULL,
 lease_until timestamptz,
 lease_token uuid,
 next_query_at timestamptz,
 created_at timestamptz NOT NULL,
 updated_at timestamptz NOT NULL,
 PRIMARY KEY(user_id,id),
 FOREIGN KEY(user_id,project_id) REFERENCES workspace_projects(user_id,id),
 FOREIGN KEY(config_id,user_id) REFERENCES api_configs(id,user_id),
 FOREIGN KEY(config_id,secret_version) REFERENCES api_secret_versions(config_id,secret_version),
 CHECK(document->>'id'=id::text)
);
DROP INDEX workspace_assets_owner_hash_idx;
CREATE UNIQUE INDEX workspace_assets_owner_hash_idx ON workspace_assets(user_id,sha256) WHERE state='complete' AND trashed_at IS NULL AND document->>'sourceRunId' IS NULL;
CREATE UNIQUE INDEX workspace_assets_source_run_idx ON workspace_assets(user_id,(document->>'sourceRunId')) WHERE document->>'sourceRunId' IS NOT NULL;
CREATE INDEX workspace_video_runs_execution_idx ON workspace_video_runs((document->>'executionState'),created_at);
CREATE TABLE workspace_video_uploads (
 user_id uuid NOT NULL,
 run_id uuid NOT NULL,
 asset_id uuid NOT NULL,
 state text NOT NULL CHECK(state IN ('sending','succeeded','unknown')),
 remote_id text,
 PRIMARY KEY(user_id,run_id,asset_id),
 FOREIGN KEY(user_id,run_id) REFERENCES workspace_video_runs(user_id,id),
 FOREIGN KEY(user_id,asset_id) REFERENCES workspace_assets(user_id,id)
);
