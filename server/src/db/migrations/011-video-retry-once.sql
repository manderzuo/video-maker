-- At most one linked retry per original run, independent of leases/restarts.
CREATE UNIQUE INDEX workspace_video_retry_once_idx ON workspace_video_runs(user_id,(document->>'retryOfRunId')) WHERE document->>'retryOfRunId' IS NOT NULL;
