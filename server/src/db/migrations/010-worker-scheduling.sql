-- Preserve active task identities while separating query and delivery schedules.
ALTER TABLE workspace_video_runs
 ADD COLUMN query_control_revision integer NOT NULL DEFAULT 0,
 ADD COLUMN query_retry_count integer NOT NULL DEFAULT 0,
 ADD COLUMN next_delivery_at timestamptz,
 ADD COLUMN delivery_retry_count integer NOT NULL DEFAULT 0;
ALTER TABLE workspace_video_uploads ADD COLUMN expires_at timestamptz;
ALTER TABLE workspace_tasks
 ADD COLUMN finalize_attempts integer NOT NULL DEFAULT 0,
 ADD COLUMN next_finalize_at timestamptz,
 ADD COLUMN finalize_error text;
CREATE INDEX workspace_video_query_due_idx ON workspace_video_runs(next_query_at,created_at) WHERE lease_token IS NULL;
CREATE INDEX workspace_video_delivery_due_idx ON workspace_video_runs(next_delivery_at,created_at) WHERE lease_token IS NULL AND document->>'executionState'='succeeded';
CREATE INDEX workspace_prompt_finalize_due_idx ON workspace_tasks(next_finalize_at,created_at) WHERE document->>'executionState'='response_received';
