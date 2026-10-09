CREATE TABLE workspace_agent_conversations (
 user_id uuid NOT NULL,
 id uuid NOT NULL,
 project_id uuid NOT NULL,
 document jsonb NOT NULL,
 PRIMARY KEY(user_id,id),
 FOREIGN KEY(user_id,project_id) REFERENCES workspace_projects(user_id,id),
 CHECK(document->>'id'=id::text)
);
CREATE TABLE workspace_agent_versions (
 user_id uuid NOT NULL,
 id uuid NOT NULL,
 revision integer NOT NULL,
 document jsonb NOT NULL,
 PRIMARY KEY(user_id,id,revision),
 FOREIGN KEY(user_id,id) REFERENCES workspace_agent_conversations(user_id,id) ON DELETE CASCADE
);
CREATE TABLE workspace_agent_receipts (
 user_id uuid NOT NULL,
 id uuid NOT NULL,
 conversation_id uuid NOT NULL,
 fingerprint text NOT NULL,
 PRIMARY KEY(user_id,id),
 FOREIGN KEY(user_id,conversation_id) REFERENCES workspace_agent_conversations(user_id,id) ON DELETE CASCADE
);
CREATE TABLE workspace_agent_proposals (
 user_id uuid NOT NULL,
 id uuid NOT NULL,
 conversation_id uuid NOT NULL,
 document jsonb NOT NULL,
 frozen_grant jsonb NOT NULL,
 PRIMARY KEY(user_id,id),
 FOREIGN KEY(user_id,conversation_id) REFERENCES workspace_agent_conversations(user_id,id),
 CHECK(document->>'id'=id::text)
);
CREATE TABLE workspace_agent_runs (
 user_id uuid NOT NULL,
 id uuid NOT NULL,
 conversation_id uuid NOT NULL,
 config_id uuid NOT NULL,
 secret_version integer NOT NULL,
 frozen_config jsonb NOT NULL,
 frozen_graph jsonb NOT NULL,
 frozen_grant jsonb NOT NULL,
 document jsonb NOT NULL,
 request_body text NOT NULL,
 result_snapshot jsonb,
 lease_until timestamptz,
 created_at timestamptz NOT NULL,
 updated_at timestamptz NOT NULL,
 PRIMARY KEY(user_id,id),
 FOREIGN KEY(user_id,conversation_id) REFERENCES workspace_agent_conversations(user_id,id),
 FOREIGN KEY(config_id,user_id) REFERENCES api_configs(id,user_id),
 FOREIGN KEY(config_id,secret_version) REFERENCES api_secret_versions(config_id,secret_version),
 CHECK(document->>'id'=id::text)
);
CREATE TABLE workspace_agent_previews (
 user_id uuid NOT NULL,
 id uuid NOT NULL,
 conversation_id uuid NOT NULL,
 document jsonb NOT NULL,
 frozen_config jsonb NOT NULL,
 frozen_graph jsonb NOT NULL,
 frozen_grant jsonb NOT NULL,
 request_body text NOT NULL,
 task_id uuid,
 PRIMARY KEY(user_id,id),
 FOREIGN KEY(user_id,conversation_id) REFERENCES workspace_agent_conversations(user_id,id),
 FOREIGN KEY(user_id,task_id) REFERENCES workspace_agent_runs(user_id,id)
);
