# Result recovery and billing display

The cloud result worker retains the bounded Retry-After header and schedules an existing result download after HTTP 429. It never resubmits generation to recover file contention. Successful persistence and placement clear the stale RESULT_SAVE_PENDING issue. Other unresolved failures remain visible.

Task billing is read from the task-level billing_state as well as legacy error envelopes. A successful video with pending accounting continues to be polled; completed execution alone does not imply settled billing.

Validation: 101 server tests covering worker stability, video tasks and outbound request boundaries; 20 Core contract tests; frontend and server TypeScript checks; targeted ESLint. No paid model invocation was performed. Package desktop and mobile builds with their existing mobile flag values; preserve runtime configuration, keyring, schema and task identities during deployment.

Deployed source: `ab93c8599d971836ca011ea66693dcc8971366b0`. Backend: `/opt/aiwork-studio/releases/cloud-hold-reconcile-ab93c8599d97`; desktop: `/opt/aiwork-studio/releases/frontend-patch-ab93c8599d97/dist`; mobile: `/opt/aiwork-studio/releases/mobile-preview-ab93c8599d97/dist`. Archive inventories, existing hashed assets, desktop/mobile index hashes and HTTPS health were checked. Runtime settings and keyring were retained; no Studio database migration or paid task submission occurred. Existing historical task display residues were not rewritten by direct SQL.
