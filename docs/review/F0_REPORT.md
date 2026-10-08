# F0 verified failure-reason preservation

Evidence recorded 2026-10-08T11:10:04.786429+00:00. Branch `feat/account-api-cloud`, complete local base `24d78bc8b5f5c13bffda0150dd60824caadd7cfd`. This report supersedes the F0 implementation and validation checkpoints for current validation, independent review, candidate identity and deployment-baseline interpretation. The scoped local commit identity is recorded in the post-commit handoff and Git history.

F0 is locally implemented, independently reviewed and validated. Trusted failed video responses can carry a bounded, sanitized failure reason through Run, PollSummary and submission-recovery storage. Both task details and canvas queue show the same cause, approved numeric upstream code and separately reconciled billing state. Billing-only replies, reopening and reload preserve the known cause and original task/request/binding identity. Terminal completion time stays stable. Optional malformed diagnostic data and old records remain compatible. No arbitrary provider text is stored or displayed.

The reference-image diagnosis requires a known failed gateway status plus the complete approved `input image [content[n]] may contain [a] real person` clause. Numeric code 3003 alone, unrelated prompt/output prose, negation, arbitrary HTML or unknown gateway reasons never establish that diagnosis. Pending billing says final charging is not yet confirmed; settled/released/reserved states use their own fixed messages.

## Independent review and corrections

An explicitly authorized read-only reviewer, `/root/f0_readonly_review`, found one P2: the initial broad matching expression could turn unrelated output/prompt prose into reference-image rejection. It also identified a coverage gap for an immediately failed submission followed by a failed Run save. Real regression tests reproduced five classification failures (46 passing); the corrected complete-clause matcher and a journal-to-Run recovery test passed 52/52 focused cases. The recovery case preserves request body, idempotency and identity, with only one mocked generation submission and one recovery query. The reviewer then reported no remaining findings within F0 source/test scope. See [review record](F0_INDEPENDENT_REVIEW.md).

Earlier self-review fixes also remain covered: internal reason labels cannot bypass gateway trust, and the queue permits both diagnostic lines to remain visible. Final browser screenshots were inspected at 768px canvas width and restored task detail; the cause, code and billing text are visible.

## Fresh verification

- Full unit suite: 559/559, 77 files, zero failures.
- Related browser suite: 6/6 (legacy failure reason, terminal billing recovery/stop, F0 task/canvas persistence). Both F0 cases assert zero POSTs, no raw provider text or fake secret in storage/diagnostic export, and stable identities through billing/reopen/reload.
- Scoped TS/TSX lint, typecheck, production build, bundle budget and source/test diff whitespace checks: exit 0.
- Task 0 existing Welcome/connection baseline: 5/5 browser cases. These do not prove the proposed simplified form or accounts implementation.
- The browser test server on 127.0.0.1:4179 closed. Tests used mocks/fake credentials; no paid API call occurred.

Exact commands and SHA256 hashes are in [F0.json](evidence/F0.json). Logs and screenshots remain under `work/account-api-cloud/` in this checkout. Fresh build artifact: `work/account-api-cloud/F0-reviewed-candidate.zip`, SHA256 `4c49a9a1b8260c8287706c8bf16986a0babd3ad44ba14f7cac32f802109b2fa1`. It replaces the earlier candidate for this local stage.

## Commit boundaries and production limitation

Only the 10 F0 product files, six F0 test files and these three final report/evidence files are selected for the local commit. Inherited user documentation is excluded. The original repository source/tests remain untouched; the complete snapshot/history bundle is retained adjacent at `../baseline`.

QA62 deployment records describe a mixed source package: base `2e61b9f` plus only three files from `ca7e248`, rather than the complete local `24d78bc` source tree. The current candidate therefore may also contain older local changes not present online; it is not a validated pure F0 patch against that deployed package. The former checkpoint's `ca7e248 -> 24d78bc` source comparison was a local Git fact, not proof of deployed-source equality. No fresh production release verification, push, merge or deployment occurred.

## Task 0 handoff

[Environment mapping](account-cloud-environment-mapping.md) distinguishes observed local state, historical deployment records, proposed configuration and unknown production facts. The documented proxy clears Cookie and hides Set-Cookie; session routes need a reviewed dedicated location. The service has `ProtectSystem=strict` without a writable private-data path. Production database/version, private data storage, backups and encryption-key configuration remain unverified.

Docker is ready and the separate PostgreSQL 16.14 tmpfs test container `aiwork-studio-account-test-20261008` accepts connections on 127.0.0.1:55432; transaction write/rollback smoke passed. This is not durable storage or a migrated account service. Exact official-registry dependency candidates are recorded, but no server dependency lock/install or native hashing/driver smoke has been completed. Account/API implementation has not started. Next short stage: fixed server dependencies and installation/smoke against this isolated test DB, then the account/session slice. Production migration, real credentials, push/merge/deployment remain outside current authorization.
