# Account backend verified stage

Observed 2026-10-08T12:14:47.056617+00:00 UTC. Base b91fc6e24750a962c6801d41d4b069a475f52f43, branch feat/account-api-cloud. This snapshot precedes the scoped local commit; work/account-api-cloud/account-auth-handoff.json records the resulting commit and exact scope. Account backend is locally implemented and verified; frontend integration and production readiness remain pending.

## Implemented behavior

Eight method/path pairs: GET /studio-api/auth/bootstrap; POST /studio-api/auth/register, /login, /logout; GET /studio-api/session; GET/PATCH /studio-api/me/document; PATCH /studio-api/me/onboarding. The injectable Fastify factory requires an explicit PostgreSQL Pool and exact HTTPS origin; it has no listening entrypoint or automatic migration. SQL001-users.sql was applied only in isolated random test schemas.

Usernames use strict Unicode length/character validation plus NFKC/trim/English-case normalization and a unique DB key. Passwords preserve input and use Argon2id19456KiB/t2/p1. Session and preauth secrets are random32-byte host-only Secure/HttpOnly/SameSite=Lax/Path=/ Cookies; DB stores digests. Purpose-separated HMAC derives CSRF tokens, with byte-length checks before constant-time comparison. Successful bootstrap consumption/session rotation is transactional. Sessions expire after24h idle or7d absolute and logout revokes the current session.

Authenticated business requests derive identity solely from the Cookie/session and require X-Workspace-Context. Writes require exact Origin and session CSRF. Old A context with B Cookie returns409 without operating on B. Repositories always filter by current owner; conditional expectedRevision updates prevent lost writes. Preferences/page input is strict and excludes independent model defaults. The resource-ID ownership probe is a test-only adapter over the real guard/repository, not an added production endpoint.

Persistent rate counters enforce30auth requests/IP/minute,10registrations/IP/hour and five failed account+IP logins/15minutes, with serialized concurrent failure checks and no proxy-address trust. Requests are limited to16KiB. Public exemptions use the router's canonical matched route; unknown paths never receive public exemptions. Normal/encoded/absolute-form auth routes share limits. All responses, including early framework errors, use no-store and fixed error codes without reflected URL or internal details.

## Review and validation

Independent read-only review found one important issue and two minor error-format issues; all were reproduced and repaired. The reviewer confirmed closure through bounded source rechecks and did not run tests or mutate state. See [review record](ACCOUNT_AUTH_INDEPENDENT_REVIEW.md).

| Check | Actual result |
| --- | --- |
| Final whole backend suite |65/65, six files, exit0 (59 account/document/security cases plus6 dependency/driver cases) |
| Backend typecheck and scoped ESLint |exit0 |
| Fresh frontend units |559/559,77files, exit0 |
| Existing Welcome/API selection browser regression |5/5, exit0, local fake-provider setup |
| Frontend typecheck/build/bundle |exit0 |
| Remaining isolated account-test schemas |0 |
| Original HEAD/source/tests/package/lock |unchanged; original HEAD24d78bc8b5f5c13bffda0150dd60824caadd7cfd |
| Frontend/original dependency hashes |all four match prerequisite snapshot |

The final65-case run followed the last source adjustment. Initial framework-error behavior was65/65 but callback typing failed; explicit FastifyError/Request/Reply parameter types corrected the generic inference without changing runtime behavior, and the full suite/typecheck/lint were rerun successfully. Silent ESLint produced no Tee logfile; exit0 is recorded from the actual command result. Raw commands, log hashes/UTC timestamps and source hashes are in [evidence](evidence/account-auth-validation.json). Vitest console clock is the host local clock; evidence uses UTC file timestamps and observed UTC.

## Pending integration and boundaries

Frontend registration/login/AuthBoundary, per-user preferences loading/cleanup and API/Welcome form changes are still pending. Existing frontend/local workspace and old proxy endpoints are not connected or migrated. Broader projects/assets/tasks/media ownership and browser HTTPS/proxy account acceptance must be implemented before product exposure. These tests establish this backend factory's scope, not complete product acceptance.

Historical production QA62 was mixed source (2e61b base plus three files), so this local branch is not a pure patch of the verified deployed tree. Current online deployment, database/private storage/backups/encryption-key mapping and Linux native runtime remain unverified. No push, merge, deployment, production migration/credentials or paid API calls occurred. The next stage resumes frontend/account integration only after the parent receives this checkpoint.
