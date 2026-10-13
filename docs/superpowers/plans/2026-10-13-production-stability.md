# Production stability implementation plan

> **For agentic workers:** Use superpowers:executing-plans and test-driven-development for each independent repository. Use dispatching-parallel-agents only across the explicitly separated ownership domains below.

**Goal:** Resolve the production audit findings without duplicate paid submissions, false refunds, or desktop/mobile regressions.

**Architecture:** Retain the existing Studio → Core → AI Work contracts and identities. Make task scheduling fair, retain inputs for their actual workflow lifetime, distinguish permanent input loss from temporary storage errors, and bound network work. Add supervision, operational alerts and recoverable backups around the existing deployment.

**Tech Stack:** TypeScript/PostgreSQL, Rust/SQLite, PowerShell, Linux systemd and Python.

**Spec:** The user's approved audit and instruction “把这些问题修复了”, recorded below as acceptance requirements. Existing release baseline: Studio e9427ab, Core 058a7b8, AI Work 0c27287.

## Global constraints

- User subsequently instructed that all sub-agents stop. The main session completes remaining implementation, verification and release alone; do not restart or create agents.

- Preserve request, budget, account, task and billing identity. Never automatically repeat an uncertain paid submission or turn unknown fees into zero.
- Existing deployment/push authorization applies. Publish only after targeted regression checks and review; retain rollback data and binaries.
- Use existing isolated work directories. Do not touch the dirty original Studio checkout.
- AI Work is live. Host-lease tests require an explicitly coordinated maintenance stop; no agent may run them or stop production independently.
- No paid generation is needed for deterministic fault injection. Any live verification is read-only unless separately coordinated.
- No credentials, signed URLs or private prompts in repository files or diagnostic outputs.
- Changes to health reporting must preserve the existing public liveness contract. Detailed operational state stays private.
- Independent implementations communicate through existing contracts plus permanent input codes `reference_asset_expired` and `reference_asset_missing`; temporary read errors remain retryable. Core maps expired, proven-unsent authorizations to `budget_policy_expired` without changing financial records.

## Review focus

- Observer timeout while underlying network work remains active must not release an identity for another paid send.
- Restart while a helper has finished but video has not started must preserve valid input or finish with a truthful permanent failure.
- Slow old tasks, a poisoned result and repeated reconciliation errors must not starve unrelated users.
- Pause/resume racing with query/download must preserve the current lease and user intent.
- Backup, monitoring and cleanup must neither expose secrets nor delete live inputs/results or reset unresolved billing.

## Task 1 Studio workers and resource mappings

Owner: main session. Repository E:/trae-studio/work/studio-migration-publish-20261012.

Files: server/src/tasks/{video-worker,video-repository,prompt-worker}.ts, server/src/projects/purge.ts, server/src/prompts/repository.ts, new additive migration, relevant domain error mapping and server tests.

- [x] Convert the three private audit reproductions into permanent regression tests: fair scheduling with 3 tasks and slow old queries; pause/resume preserving active lease; project deletion during prompt response cannot poison the queue.
- [x] Separate bounded submit/query/delivery worker budgets while keeping no duplicate sends; schedule by due time with bounded retry backoff, not permanent created-at priority. Multi-instance claims remain transactional.
- [x] Persist upload expiry, verify every reference immediately before submit, refresh only when dispatch is proven absent. Cover multiple sequential uploads and stale persisted mappings.
- [x] Preserve active lease during user query controls, merge current user intent on writeback and check CAS row count before side effects.
- [x] Make durable prompt finalization independent from deleted source-project metadata where safe; persist bounded retry/error information and isolate poison jobs. Do not re-call a model whose response was saved.
- [x] Map permanent Core input failures accurately without claiming no helper charge. Run changed server suites, typechecks and related domain tests; report commands, counts and remaining limitations. Commit only owned files; no push/deploy.

## Task 2 AI Work upload, budget and cache lifecycle

Owner: main session. Repository E:/trae-studio/work/aiwork-capacity-qa61.

Files: src-tauri/src/api_server/{trae_resource_upload,bridge_planner,bridge_prepared,video,video_store,bridge_artifacts}.rs and focused helpers/tests.

- [x] Add fault tests for slow/trickling upload plan/PUT/commit and result lookup/download; implement an overall bounded network budget with response limits, including a considered DNS boundary. Retain concurrency ownership until actual work ends.
- [x] Recheck current time, policy/capacity evidence after input normalization; sign only an authorization that is still usable. Expired/canceled requests must not silently acquire a fresh paid identity.
- [x] Preserve Core's 120-second preparation observer contract: bound preparation below it where possible and return stable not-sent errors for proven preparation failures.
- [x] Run bounded periodic cache cleanup during continuous operation, with capacity limits and protection for active downloads/readers/frame extraction. Cover old files without restarting the API.
- [x] Run pure/isolated tests now; list host-lease tests for parent maintenance window. Commit only owned files; no push/deploy.

## Task 3 Core retained inputs and terminal recovery

Owner: main session. Repository E:/trae-studio/work/core-qa32-345670b.

Files: starlink-dimension-router/src/{budget_flow,budget_continuation,reference_context,work_execution,work_media,assets,budget_errors,seedance_feedback}.rs and src-core storage as needed.

- [x] Reproduce successful helper + expired original asset + no video step. Retain/pin inputs for the confirmed workflow, and resume from immutable owned material rather than an expired transient identifier.
- [x] Distinguish proven expired/missing asset from transient storage/I/O failure. Surface stable permanent codes and terminate only when the existing store CAS proves no unfinished/unknown paid step; preserve settled helper fees and unknown holds.
- [x] Map already-expired preparation to stable terminal policy failure or an explicit proven-unsent replacement protocol; never endlessly replay an expired token.
- [x] Add persisted/owned backoff to continuation errors and bounded attention handling while preserving fairness. Verify work-version/media leases follow terminal outcomes.
- [x] Cover restart recovery and permanent/transient cases with isolated tests. Prepare a read-only diagnosis and safe legacy-task closure path for the 22-hour request, but do not touch production. Commit only owned files; no push/deploy.

## Task 4 Production operations

Owner: parent. Scripts/docs in Studio scripts/production-ops and deployment records; installed configuration on the existing authorized hosts.

- [x] Add private aggregate monitor for queue age, stuck finalization, unknown/reconciliation age, disk capacity, process/bridge health and backup freshness. Persist alert state and journal visible warnings with no private task contents. Keep liveness separate.
- [x] Add Windows scheduled supervision that checks the intended AI Work/FRP binaries, respects maintenance inhibition and existing host-lease recovery, and avoids duplicate GUI/session processes.
- [x] Automate consistent database/private asset/config/key backups; copy encrypted, integrity-checked backups to the other existing host for failure-domain separation. Retain bounded generations.
- [x] Perform an isolated database restore/integrity verification and validate required private assets/config/keyring; never restore into production or mutate billing to make an exercise pass.
- [x] Record pending settlement counts/ages and an evidence-based closure procedure. Never blanket-release historical holds.

## Task 5 Review and deployment

- [x] Review repository diffs, cross-service error mappings, backward compatibility and new migrations. Resolve material defects before release.
- [x] Run necessary consolidated regressions; coordinate AI Work host-lease maintenance only once test/build artifacts are ready. No repeated whole-suite runs without a change or unresolved concern.
- [x] Back up live ledger/database/config, build pinned artifacts, activate services with rollback, and safely close only proven permanent pre-video legacy failures.
- [ ] Verify original request and financial identities, healthy services, fair queue progress, new monitor/backup schedules and repository publication.
- [ ] Report actual tests, deployed revisions and remaining provider limitations. Do not claim a long soak test or guaranteed upstream availability without evidence.

## Progress

- Planning: user approved repair of all audited findings; no additional approval gate is needed for this authorized repair batch.
- Baseline: three code checkouts clean; live production continues running. Studio and AI Work linked worktrees reused; Core is the existing dedicated repair checkout.
- Task 1 implementation complete: Studio commits 45890ed and 70b10c0, server 323 tests and related domain 197 tests passed; both typechecks and changed-file lint passed. Independent review pending.
- Task 2/3 implementation in progress in their separate repositories. No production application activation yet.
- Task 4: encrypted Linux snapshot produced 20261013T041110Z; restored into an isolated temporary PostgreSQL database, verified 40 original/thumbnail asset records and SQLite integrity with 511 retained budget steps. Temporary database removed. No service stop or AI submission occurred.
- Task 1 review complete: c82d087 fixes the attention/resume race (35 affected tests, typecheck passed); no remaining blockers.
- Task 3 implementation 10aa72f: 409 router / 275 store tests passed, one private-backup-only test deferred; independent review identified three recovery/replay boundaries, now in correction.
- Task 2 implementation 647d3dd: 80 isolated tests passed; host-lease checks remain for coordinated maintenance. Review identified cache-admission progress at capacity, now in correction.
- Task 4 review: recipient authentication, fresh settlement heartbeat and required Core media recovery verification corrected; 6 operational unit checks passed. Actual encrypted archive verification restored 40 Studio asset records, 511 Core steps and 126 required encrypted Core media. Linux and Windows ciphertext mirrors verified; 23 native unresolved holds preserved. Linux timers and limited-user Windows scheduled supervisor/backup installed. Disk severity consistency corrected as well.

- Final verification completed solo after the user stopped all sub-agents. No new agent was created or resumed.
- Core 804056b deployed with schema 31; immutable production-backup migration passed (44 historical tables preserved). Final exact-reference recovery source 0b81db3 passed 108 focused cases; bridge expiry/missing recovery preserves the original claim and helper invocation count. Its Linux artifact is deployed and healthy; the 511 original budget steps and ledger hashes are unchanged.
- AI Work source 4995846 fixes first-anchor timestamp consistency and adds administrator-only restoration of identical reference bytes under the frozen asset ID. Maintenance-window checks: 58 passed, 1 optional live-media probe skipped; 15 protected tables and 23 unresolved holds unchanged. The final release is now activated and healthy; two additional real capacity/resource read-only probes passed with credentials unchanged and zero paid submissions.
- Studio source 683e8a3 backend, desktop and mobile are deployed; additive migration 010 preserved every historical task document. All deployed static file hashes were checked.
- Exact old Studio task check: the original long-running helper-only request reached 8 failures and attention; Studio shows interrupted query and does not loop. It has NOT been declared completed or automatically re-submitted. A separate old Core request closed with reference_asset_expired. The other already-sent unknown video retains its original held budget.
