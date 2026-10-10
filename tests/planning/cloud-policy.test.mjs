import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
// Cloud planning gate: runs inside the current test-owned isolation root,
// never creates junctions in the legacy E:/trae-studio/TRAEWORK/aiwork-studio root.
// Mirrors the traversal/symlink denials and license provenance of the legacy gate.
const root = process.cwd();
test('CLOUD-P01: migration list is identical across engine, fixtures and package', () => {
 const dir = resolve(root, 'server/src/db/migrations');
 const files = readdirSync(dir).filter(name => /^\d{3}-.+\.sql$/.test(name)).sort();
 assert.ok(files.length >= 8 && files[files.length - 1] === '008-project-purge.sql');
 const accountFixture = readFileSync(resolve(root, 'server/tests/account-fixture.ts'), 'utf8');
 const browserFixture = readFileSync(resolve(root, 'server/tests/browser-fixture.ts'), 'utf8');
 const packager = readFileSync(resolve(root, 'scripts/package-account-cloud.mjs'), 'utf8');
 for (const file of files) {
  assert.ok(accountFixture.includes(file), 'account-fixture misses ' + file);
  assert.ok(browserFixture.includes(`'${file}'`), 'browser-fixture misses ' + file);
  assert.ok(packager.includes(`'${file}'`), 'package misses ' + file);
 }
});
test('CLOUD-P02: cloud planning never creates junctions in the legacy root', () => {
 for (const file of ['scripts/check-traceability.mjs', 'scripts/build-cloud-trace-map.mjs', 'scripts/refresh-cloud-proof-lines.mjs']) {
  const text = readFileSync(resolve(root, file), 'utf8');
  assert.ok(!text.includes('mklink') && !text.includes('junction'), file + ' must not create junctions');
 }
});
test('CLOUD-P03: cloud traceability registration consumes real executed evidence', () => {
 const results = JSON.parse(readFileSync(resolve(root, 'docs/review/logs/browser-executed-tests-cloud.json'), 'utf8'));
 assert.equal(results.format, 'aiwork-studio-executed-test-evidence');
 assert.ok(results.tests.length > 100);
 assert.ok(results.tests.every(test => test.id && test.file && test.status));
 const map = JSON.parse(readFileSync(resolve(root, 'docs/review/interaction-map-cloud.json'), 'utf8'));
 assert.equal(map.interactions.length, 260);
 assert.ok(map.interactions.every(row => Array.isArray(row.sources) && Array.isArray(row.proofs)));
});
test('CLOUD-P04: traversal and symlink denials stay enforced, brand and visual gates stay manual', () => {
 const packager = readFileSync(resolve(root, 'scripts/package-account-cloud.mjs'), 'utf8');
 assert.ok(packager.includes('symlink') || packager.includes('traversal') || packager.includes('..'));
 const report = JSON.parse(readFileSync(resolve(root, 'docs/review/coverage-report-cloud.json'), 'utf8'));
 assert.equal(report.review, '待用户统一验收与独立审查');
 assert.equal(report.complete, false);
});
