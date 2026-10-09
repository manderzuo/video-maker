-- 008: project purge tombstone. Keep the project identity row for history foreign
-- keys; delete only the editable graph and undo/redo state. Never DELETE the row.
ALTER TABLE workspace_projects
 ADD COLUMN purged_at timestamptz,
 ADD COLUMN purged_revision integer CHECK (purged_revision IS NULL OR purged_revision >= 0);
CREATE TABLE workspace_project_purges (
 user_id uuid NOT NULL,
 id uuid NOT NULL,
 project_id uuid NOT NULL,
 revision integer NOT NULL CHECK (revision >= 0),
 node_count integer NOT NULL CHECK (node_count >= 0),
 fingerprint text NOT NULL,
 created_at timestamptz NOT NULL,
 PRIMARY KEY (user_id,id),
 FOREIGN KEY (user_id,project_id) REFERENCES workspace_projects(user_id,id)
);
