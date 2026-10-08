# Studio backend prerequisite workspace

This package is independent from the frontend dependency junction. Direct dependency versions are exact and all transitive versions are fixed in package-lock.json. The current stage contains dependency and database-driver tests only; there is no account service or listening process yet.

Use the repository's fixed Node22.23.3/npm11.6.2 toolchain. From the repository root, set npm cache and TEMP/TMP under work/account-api-cloud before installing. Install with:

```powershell
. .\scripts\use-local-toolchain.ps1
$env:npm_config_cache=Join-Path (Get-Location) 'work\account-api-cloud\npm-cache'
$env:TEMP=Join-Path (Get-Location) 'work\account-api-cloud\npm-temp'
$env:TMP=$env:TEMP
New-Item -ItemType Directory -Force -Path $env:npm_config_cache,$env:TEMP | Out-Null
npm --prefix server ci --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org
npm --prefix server run test
npm --prefix server run typecheck
```

Lifecycle scripts are disabled. The packaged Windows x64 Argon2 native binary was actually loaded and verified. Linux deployment compatibility still needs verification in its actual environment; no global compiler or system service was installed.

The driver test deliberately connects only to 127.0.0.1:55432 / aiwork_studio_test / aiwork_test with the synthetic credential for the existing aiwork-studio-account-test-20261008 tmpfs container. It does not consume DATABASE_URL. It creates only transaction-local TEMP data, tests parameterization and a uniqueness violation, then rolls back and asserts the table is gone. This is driver acceptance, not account authorization or durable storage acceptance.

The dependency tests use Fastify inject, fake cookies, strict Zod parsing and Argon2id with memoryCost19456KiB/timeCost2/parallelism1. They verify correct/wrong passwords, fresh salt and unmodified Unicode/case/whitespace. Cookie serialization is checked for Secure/HttpOnly/SameSite=Lax/Path=/ with no Domain; no real session is created.

Primary package documentation: [Fastify](https://fastify.dev/docs/latest/Guides/Migration-Guide-V5/), [cookie](https://github.com/fastify/fastify-cookie), [Argon2](https://github.com/ranisalt/node-argon2), [PostgreSQL transactions](https://node-postgres.com/features/transactions).

Next: implement the planned account/bootstrap/session/CSRF/context interfaces with failing behavioral tests and two-user isolation before exposing any existing private workspace.
