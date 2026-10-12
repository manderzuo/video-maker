# Prompt optimization reply timeout — 2026-10-12

The two latest affected production calls started at 12:27:25 and 12:30:17 Asia/Shanghai. Read-only task metadata shows both ended after approximately 120.4 seconds with `response_unknown`, `pending_reconciliation`, `UPSTREAM_FAILED`, and no saved response. The configured text model was `deepseek-v4.1-flash`. Each request included one image, approximately 734 KiB total; an earlier request with the same image completed in approximately 78 seconds. No request body, credential, or raw private provider message is included in this report.

The completion adapter imposed a 120-second total deadline. The prompt worker also used a 150-second sending lease and flattened the timeout into a generic failure. These timings identify the local deadline boundary; they do not establish why the provider had not returned or whether the provider charged the requests. OpenCode documents the configured Go completion route and directs users to its console for usage records: https://opencode.ai/docs/go/ . No documented response-recovery operation was found in that page, and no affected paid request was replayed.

## Change

- Only prompt optimization opts into a bounded 300-second completion budget. Other text callers retain their 120-second default; video and catalog deadlines retain their existing budgets. DNS resolution remains bounded to 15 seconds.
- The prompt sending lease is derived from the same budget plus 30 seconds. A reply arriving after the former lease deadline remains eligible for the original task's result, without another outbound call.
- Production service inspection found a 90-second stop timeout. `TimeoutStopSec=360` allows graceful worker shutdown to drain the five-minute request budget; the unit must be installed and verified during release, with its previous bytes available for rollback.
- On failure, `result_snapshot` retains bounded, allowlisted diagnostic metadata: cause, elapsed time, configured deadline, and HTTP status when available. It never stores raw exception messages, response text, prompts, images, or keys. Successful candidate persistence and local finalization retries remain unchanged.
- Existing public task schemas, uncertain billing state, confirmation idempotency, and the explicit acknowledgement of previous unknown calls are preserved. No automatic replay or assertion of a refund, charge, or successful provider execution is added.

## Verification before packaging

The clean RED run produced 13 expected failures and 58 passes: the old deadline rejected a slow completion, the old lease discarded an in-flight reply, and failure diagnostics were absent. An initial test run also revealed an overlong synthetic username and an asynchronous test assertion issue; the fixtures were corrected before the clean RED run.

The GREEN focused run passed 71 tests. The slow-task regression advances synthetic time by 180 seconds through the actual completion adapter and prompt worker, runs lease recovery, then saves the received result with exactly one provider-adapter invocation. Deadline tests verify the 120-second default, the 300-second prompt limit, DNS hangs, abort behavior, invalid deadline inputs, and safe timeout/oversize/parse-failure metadata. Existing ownership, frozen credentials, confirmation replay, expired lease, input revision, save retry, and task-history tests still pass.

The full backend suite passed 306 tests across 29 files. Backend type checking and the existing repository lint command passed. All upstream responses in tests are synthetic. No new formal account task or paid model request was issued for verification. The original two calls remain unknown.

## Release boundary

Backend and service-unit deployment with verified backup and restore is intended. Desktop and mobile frontend bytes, Nginx routing, credentials, database migrations, and dependency locks must remain unchanged. The longer deadline addresses premature local cancellation; it cannot guarantee upstream availability or recover a response that was never saved. Deployment identity and online verification will be recorded after execution.
