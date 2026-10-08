# Independent account backend review record

Recorded 2026-10-08T12:14:47.056617+00:00. Reviewer: /root/auth_readonly_review, fresh history-free read-only agent, explicitly authorized. Initial review checked all17 checkpoint source/test hashes against account-auth-checkpoint-1.json; HEAD was b91fc6e and index empty. This is a faithful summary of received reports, not a claim that the reviewer executed tests.

| Finding | Reproduction and fix | Reviewer conclusion |
| --- | --- | --- |
| Important/P1: raw request.url prefix could skip30-IP auth limiter/no-store for encoded routes; valid encoded private route also missed current context |Actual new cases failed (200/401 instead of429, missing no-store, private own request401). Guard now uses request.routeOptions.url for matched public exemptions/counters. Unmatched URL decoding classifies protected namespace only; it never grants an anonymous exemption. Normal/encoded/absolute URLs share counters. |Original finding resolved in first limited recheck. No proven cross-user write bypass existed in the original implementation. |
| Minor/P3: default Fastify404 reflected method/path/query |Actual authenticated unknown-path case returned raw reflected URL. Fixed not-found handler returns only NOT_FOUND; root request hook sets no-store. |Resolved in first limited recheck. |
| Minor/P3 follow-up: malformed URL400 and oversized parameter414 occurred before request hooks and reflected URL |Both real cases failed; installed Fastify fastify.js645-693 confirmed default early paths. frameworkErrors now explicitly applies no-store and fixed INVALID_REQUEST400/414, or INTERNAL_ERROR500 for other framework errors. |Final limited read-only recheck confirmed closure and found no residual issue in the requested scope. |

Additional review coverage gaps were filled: same bootstrap concurrent register attempts allow one success only; exact15/128 Unicode codepoint passwords register and log in. Existing tests cover identity/session expiry/revocation, A/B context/repository scope, Origin/CSRF, byte-length credentials handling, strict inputs, revisions, persistent and concurrent rate limits, generic error sanitization and token-digest storage.

Actual RED before canonical-route fix:5failed/32passed. Focused GREEN:37/37. Framework follow-up RED:2failed/5passed. Final complete verification:65/65 plus server typecheck and lint exit0. A callback generic type failure after first framework GREEN was corrected with explicit framework callback types and all final checks rerun. No reduced validation, auth cost, ownership or limit was used to obtain GREEN.

Review boundaries: backend factory and current-user documents only. Frontend/proxy/production integration is pending. Reviewer ran no test/API, install, service/database action or code write. Final runtime verification belongs to the executing root and is recorded separately in account-auth-validation.json.
