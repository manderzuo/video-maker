CREATE TABLE workspace_projects (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 revision integer NOT NULL CHECK (revision >= 0),
 document jsonb NOT NULL,
 created_at timestamptz NOT NULL,
 updated_at timestamptz NOT NULL,
 trashed_at timestamptz,
 UNIQUE (user_id,id,revision),
 CHECK (document->>'id'=id::text),
 CHECK ((document->>'revision')::integer=revision)
);
CREATE INDEX workspace_projects_owner_updated_idx ON workspace_projects(user_id,updated_at DESC,id);

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
