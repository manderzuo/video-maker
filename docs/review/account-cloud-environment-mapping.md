# Task 0 environment mapping checkpoint

Observed 2026-10-08T10:57:34.188499+00:00. Initial read-only production-document mapping. Local dependency verification updated 2026-10-08T11:25:18.540098+00:00. Not production verification and not completed full task 0.

## Known local / documented / proposed

| Item | Evidence and state |
|---|---|
| Original repo/source | E:/trae-studio/TRAEWORK/aiwork-studio; complete-tree base 24d78bc; isolated feat/account-api-cloud. Original source/tests unchanged. |
| QA62 documented release | /opt/aiwork-studio/releases/20261008-qa62-ca7e248. Deployment package.mjs explicitly uses sourceBase 2e61b9f plus three ca7e248 files (register-target.ts, registration.ts, ConnectionSettings.tsx). It is NOT the full source tree at ca7e248. Current remote release not checked. |
| Candidate source scope | F0 candidate is built from complete local 24d78bc + F0. Base 2e61b ->24d78bc differs across19 source files; QA62 deploy includes only3. Additional local canvas/terminal-billing changes may be absent online. Previous checkpoint comparison ca7e248 ->24d78bc merely showed two local commits' source equality; it cannot prove online source equality. A future F0-only production release requires reconstructing the exact deployed source/mixed patch and a separate validation. |
| Documented server runtime | Ubuntu24.04, Node22.23.3, aiwork-studio.service on127.0.0.1:4189, /etc/aiwork-studio/runtime.json. Documentary only; no SSH/private key/config secret was accessed. |
| Existing repo server | scripts/serve-local.mjs is static/read-only registration and proxy host, not an account service. A separate server/ dependency workspace now exists with fixed package/lock and six smoke tests; no account app/service exists yet. Current /studio-api/connections is anonymous registration with process nonce; do not reuse it as the new per-user settings API. |
| Local database | Docker29.5.3 Linux ready; separate PostgreSQL16.14 tmpfs test container aiwork-studio-account-test-20261008 at127.0.0.1:55432. Fake test credentials. pg_isready and transaction/rollback pass. |
| Production database | Unknown: current host DB services/version/Studio database existence need direct authorized verification. Docs say no Studio accounts/cloud sync at that deployment; that does not prove the entire host lacks other databases. |
| Production private data volume/backup | Unknown. Existing release/backups hold frontend release rollback material; they do not demonstrate user-content persistence or DB backups. Proposed /var/lib/aiwork-studio/private and backup location must be checked before use. |
| New application workspace | Proposed repo server/ per full plan. Same-origin /studio-api/ routes to a dedicated loopback app process; candidate port4190 must be verified before binding. No app was started. |
| Reverse proxy gap | Current deploy/nginx-studio.gemstory.cn.conf rewrites Origin/Host to4189, clears Cookie and hides Set-Cookie. New session routes require their own location preserving real Origin/Host, Cookie and Set-Cookie; exact trusted HTTPS origin must reach CSRF checks. This is a proposed future change; nothing in production config was modified. |
| Writable service paths | Current unit has ProtectSystem=strict and no ReadWritePaths; private-content/key/config writes require an explicit, reviewed writable path/owner mapping. Not yet configured. |

## Required future environment names, no values

STUDIO_BIND_HOST, STUDIO_PORT, STUDIO_ORIGIN, DATABASE_URL, STUDIO_PRIVATE_DATA_DIR, STUDIO_KEY_ENCRYPTION_KEY, STUDIO_KEY_ENCRYPTION_VERSION, NODE_ENV. Treat each as proposed contract until server implementation verifies it. No production secret is present here. Node and npm remain fixed to the current toolchain.

## Dependency lock and actual local verification

The independent server/package.json and package-lock.json fix nine direct dependencies and150 resolved package entries, all tarballs from registry.npmjs.org. Every direct version and integrity matches fresh official registry metadata. npm ci succeeded with all lifecycle scripts disabled. Windows x64 native Argon2 loaded from server/node_modules, six dependency/driver smoke tests passed, server and frontend typechecks passed and npm audit reported0 known vulnerabilities. See [current dependency report](ACCOUNT_DEPENDENCY_CHECKPOINT.md) and [validation evidence](evidence/account-cloud-dependency-validation.json). The earlier candidate JSON is historical research, superseded for installation status.

Frontend and original package/lock hashes are unchanged. No global package, compiler, new system service or network/security configuration was installed. Native Linux compatibility still needs validation at deployment time.

## Next short phase

Task0 local dependency prerequisites are verified; full production mapping remains partial. Proceed with the planned minimum account/bootstrap/session implementation and actual A/B authorization/context tests using the existing isolated PostgreSQL container. Production database/private storage/backup/key gaps stay explicit. This phase did not implement account routes, migrate production data, simplify the API forms or prove cloud storage.
