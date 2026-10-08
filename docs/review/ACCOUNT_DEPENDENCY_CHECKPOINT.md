# Backend dependency checkpoint

Verified 2026-10-08T11:25:18.540098+00:00. Branch `feat/account-api-cloud`, base `6bc1e50ed7321181971b0485b4c65164c2c4ede1`. This is the completed local dependency prerequisite slice of task0/task1, not completion of production task0 or account implementation. Commit identity is recorded in Git history and the post-commit handoff.

## Delivered and proved

A separate server/package.json, package-lock.json, TypeScript/Vitest config, README and six smoke tests now exist. Exact direct versions: Fastify 5.12.5, @fastify/cookie 11.1.2, pg 8.23.1, argon2 0.45.1, Zod 4.3.6, @types/pg 8.23.1, @types/node 22.20.4, TypeScript 5.9.3, Vitest 4.1.11. The lock resolves 150 entries; npm ci installed 125 applicable packages. Every direct version/tarball/integrity matches newly read official npm metadata and all resolved tarballs use registry.npmjs.org.

The clean lock-based install used --ignore-scripts: no third-party lifecycle script, global compiler/package or new system service ran. Cache/temp are in this checkout. server/node_modules is a normal directory independent from the frontend junction. The Windows x64 packaged Argon2 native binding was actually loaded, SHA256 `7d1716c8eafe32d54a12af5c0d3024cd715a7e1fdc8092eea84fd369d267075c`. Production Linux compatibility was not tested.

Results: six of six server smoke tests passed (two files), server typecheck passed, frontend typecheck passed. Fastify inject/cookie checks did not start a listening server. Argon2id tests verify explicit 19456 KiB / t=2 / p=1, correct/wrong passwords, random salt and preservation of Unicode/case/leading/trailing spaces. The PostgreSQL driver used only the fixed isolated fake DB, verified parameterized A/B rows and uniqueness rejection inside TEMP data, rolled back and proved the table was absent. The actual isolated PostgreSQL version read is 16.14. This does not prove account authorization or durable storage.

Official-registry npm audit returned zero known vulnerabilities at this observation. The first smoke run had 5 passes and one invalid field-order assertion; initial typecheck found a widened option.type. Installed primary package source/declarations showed named PHC parameters serialized m,p,t; the test now compares the full named map, and immutable options retain literal type 2. Costs were not lowered. Initial failures and successful reruns are retained. A Windows extended-path issue in the auxiliary inspection script was corrected with native path resolution; it was not an Argon2 failure.

Frontend and original package/lock SHA256 values match pre-install values; frontend source/tests and original source/tests are clean. Original HEAD remains 24d78bc. No paid API, production credential/data access, push, merge or deployment occurred. Only the explicit new server/config/test/report files and this task's environment mapping are selected for a local commit; inherited user documentation is excluded.

## Remaining scope

There are no local dependency/driver blockers. Account routes, user/session DB schema, CSRF/bootstrap/context handling, frontend identity barrier and full A/B authorization tests remain unimplemented. The TEMP A/B driver check is not that acceptance. Next short stage is the planned minimum account/session implementation against the existing independent test DB, beginning with behavioral failures.

Full task0 is still partial: current production release/source, DB services/version/Studio DB, private storage, backup/restore and encryption-key configuration remain unknown. Historical QA62 mixed source and current documentary Cookie/Set-Cookie/writable-path gaps are preserved in [environment mapping](account-cloud-environment-mapping.md). No production connection or modification was attempted.

Evidence: [account-cloud-dependency-validation.json](evidence/account-cloud-dependency-validation.json); command logs, registry/audit metadata and native inspection are under work/account-api-cloud. The complete original snapshot/history bundle remains retained adjacent at ../baseline. F0 commit 6bc1e50 and its tests were not repeated or changed in this dependency-only stage.
