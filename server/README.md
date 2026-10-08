# Studio backend account/session workspace

The backend package and node_modules are independent from the frontend dependency junction. Nine direct versions are exact; package-lock.json fixes all transitive versions. The injectable account/session factory is in src/app.ts. It accepts an explicitly supplied PostgreSQL Pool, exact HTTPS origin and optional test clock. No listening entrypoint or automatic migration is provided by this stage.

## Reproduce local checks

From the isolated repository root, use the fixed Node22.23.3/npm11.6.2 toolchain and worktree-local cache/temp:

```powershell
. .\scripts\use-local-toolchain.ps1
$env:npm_config_cache=Join-Path (Get-Location) 'work\account-api-cloud\npm-cache'
$env:TEMP=Join-Path (Get-Location) 'work\account-api-cloud\npm-temp'
$env:TMP=$env:TEMP
New-Item -ItemType Directory -Force -Path $env:npm_config_cache,$env:TEMP | Out-Null
npm --prefix server ci --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org
npm --prefix server run test
npm --prefix server run typecheck
npx --no-install eslint server/src server/tests
```

Lifecycle scripts are disabled. The packaged Windows x64 Argon2 binding was actually loaded. Production Linux compatibility still needs verification; no global compiler or system service was installed.

All database tests deliberately connect only to the existing aiwork-studio-account-test-20261008 tmpfs container at 127.0.0.1:55432 / aiwork_studio_test / aiwork_test with synthetic credentials. They do not consume DATABASE_URL. The driver smoke uses TEMP data and rollback. Account fixtures verify database/user, create a random account_test_<32hex> schema, apply001-users.sql only there and drop only that exact schema after each test. Migration source is never automatically applied to production.

## Current HTTP contract

- GET /studio-api/auth/bootstrap sets a ten-minute host-only preauth Cookie and returns bound csrfToken/expiresAt.
- POST /studio-api/auth/register and /login accept only username/password, requiring preauth Cookie, X-CSRF-Token and exact Origin. Success consumes preauth and rotates the authenticated session Cookie.
- GET /studio-api/session returns sanitized user/context/CSRF/onboarding state. It is exempt from X-Workspace-Context.
- POST /studio-api/auth/logout revokes current session immediately.
- GET/PATCH /studio-api/me/document and PATCH /studio-api/me/onboarding operate on the current owner with conditional expectedRevision writes.

Every authenticated business request carries X-Workspace-Context; writes additionally require X-CSRF-Token and Origin. A stale context used with another account Cookie returns409 SESSION_CHANGED. Context never grants identity independently. The guard protects unknown /studio-api/ business routes too. Cookie flags are Secure/HttpOnly/SameSite=Lax/Path=/ with no Domain; sessions have24h idle/7d absolute expiry. Database stores session/preauth token digests. Purpose-separated HMAC derives CSRF from the32-byte Cookie secret; raw session secret is not returned in JSON. Argon2id uses19456KiB/t2/p1 and preserves password Unicode/case/whitespace.

User document repositories require AuthContext and owner predicates, use a strict preferences/page contract and enforce atomic revisions. Preferences mirror the allowed current fields while excluding independent model defaults and nested lastVisitedPage. A resource-ID probe in tests is a test-only adapter over the real guard/repository; it is not a production endpoint. Database rate counters enforce30auth requests/IP/minute,10registrations/IP/hour and five failed account+IP logins/15minutes, with transaction locking for concurrent failures. Request body limit16KiB. Public exceptions use canonical matched route metadata; unmatched paths never grant public access. All responses use no-store, including fixed 404 and framework-level malformed-URL/oversized-parameter errors. Errors do not reflect URLs or internal details. Forwarded addresses are untrusted until a real reverse-proxy contract is verified.

## Integration boundaries

The existing frontend, local workspace and old proxy/registration endpoints are not connected/migrated by this stage. Frontend identity barriers, account forms, per-user preferences loading/cleanup, API configuration, broader projects/assets/tasks/media ownership and old proxy authorization remain mandatory before product exposure. The current backend tests do not establish browser HTTPS/proxy behavior or production account availability. Deployment, production schema/data, backups, private storage, encryption-key configuration and Linux native runtime require separate verified work and authorization.

Primary references: [Fastify](https://fastify.dev/docs/latest/Reference/Server/), [cookie plugin](https://github.com/fastify/fastify-cookie), [Argon2](https://github.com/ranisalt/node-argon2), [PostgreSQL transactions](https://node-postgres.com/features/transactions), [password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), [CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).
