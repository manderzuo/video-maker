CREATE TABLE workspace_activity (
 id uuid NOT NULL,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 project_id uuid,
 project_title text,
 method text NOT NULL CHECK(method IN ('POST','PATCH','PUT','DELETE')),
 route text NOT NULL,
 status integer NOT NULL CHECK(status BETWEEN 100 AND 599),
 created_at timestamptz NOT NULL,
 historical boolean NOT NULL DEFAULT false,
 execution_state text,
 PRIMARY KEY(user_id,id)
);
CREATE INDEX workspace_activity_owner_time ON workspace_activity(user_id,created_at DESC,id DESC);
CREATE INDEX workspace_activity_project_time ON workspace_activity(user_id,project_id,created_at DESC,id DESC);
-- Existing command receipts are genuine historical operations, not reconstructed UI clicks.
INSERT INTO workspace_activity(id,user_id,project_id,project_title,method,route,status,created_at,historical)
 SELECT r.id,r.user_id,r.project_id,p.document->>'title','POST','/studio-api/projects/:id/commands',200,r.created_at,true
 FROM workspace_command_receipts r LEFT JOIN workspace_projects p ON p.user_id=r.user_id AND p.id=r.project_id;

CREATE FUNCTION record_canvas_activity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO workspace_activity(id,user_id,project_id,project_title,method,route,status,created_at)
 SELECT NEW.id,NEW.user_id,NEW.project_id,p.document->>'title','POST','/studio-api/projects/:id/commands',200,NEW.created_at
 FROM workspace_projects p WHERE p.user_id=NEW.user_id AND p.id=NEW.project_id;
 RETURN NEW;
END $$;
CREATE TRIGGER canvas_activity AFTER INSERT ON workspace_command_receipts FOR EACH ROW EXECUTE FUNCTION record_canvas_activity();

CREATE FUNCTION record_task_activity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE project uuid; title text; state text; task_route text;
BEGIN
 state=NEW.document->>'executionState';
 IF state IS NOT DISTINCT FROM OLD.document->>'executionState' THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='workspace_video_runs' THEN
  project=NEW.project_id; task_route='/studio-api/runs/:id/status';
  SELECT p.document->>'title' INTO title FROM workspace_projects p WHERE p.user_id=NEW.user_id AND p.id=project;
 ELSE
  task_route='/studio-api/prompt-tasks/:id/status';
  SELECT p.id,p.document->>'title' INTO project,title FROM workspace_content c JOIN workspace_projects p ON p.user_id=c.user_id AND p.id::text=c.document->>'sourceProjectId' WHERE c.user_id=NEW.user_id AND c.id=NEW.draft_id;
 END IF;
 INSERT INTO workspace_activity(id,user_id,project_id,project_title,method,route,status,created_at,execution_state)
 VALUES(gen_random_uuid(),NEW.user_id,project,title,'POST',task_route,CASE WHEN state='succeeded' THEN 200 WHEN state IN ('failed','failed_confirmed','response_unknown','submit_unknown') THEN 409 ELSE 202 END,NEW.updated_at,state);
 RETURN NEW;
END $$;
CREATE TRIGGER video_task_activity AFTER UPDATE ON workspace_video_runs FOR EACH ROW EXECUTE FUNCTION record_task_activity();
CREATE TRIGGER prompt_task_activity AFTER UPDATE ON workspace_tasks FOR EACH ROW EXECUTE FUNCTION record_task_activity();
