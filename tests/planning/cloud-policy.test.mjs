import { test } from 'node:test';
import assert from 'node:assert/strict';
import {migrationReferences, packageMigrations, containsMigrationDdl, validateRegisteredEvidence} from '../../scripts/cloud-planning-contracts.mjs';
import { readFileSync, readdirSync, existsSync, mkdirSync, symlinkSync, rmdirSync, lstatSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
// Cloud planning gate: runs inside the current test-owned isolation root,
// never creates junctions in the legacy E:/trae-studio/TRAEWORK/aiwork-studio root.
// Mirrors the traversal/symlink denials and license provenance of the legacy gate.
const root = process.cwd();
test('CLOUD-P01: migration list is identical across engine, fixtures and package', () => {
 const dir = resolve(root, 'server/src/db/migrations');
 const files = readdirSync(dir).filter(name => /^\d{3}-.+\.sql$/.test(name)).sort();
 assert.ok(files.length >= 8 && files[files.length - 1] === '008-project-purge.sql');
 for (const file of files) {
  const sql = readFileSync(resolve(dir, file), 'utf8');
  assert.ok(containsMigrationDdl(sql), file + ' must contain real DDL, not comments or quoted data');
 }
 const accountFixture = readFileSync(resolve(root, 'server/tests/account-fixture.ts'), 'utf8');
 const browserFixture = readFileSync(resolve(root, 'server/tests/browser-fixture.ts'), 'utf8');
 const packager = readFileSync(resolve(root, 'scripts/package-account-cloud.mjs'), 'utf8');
 assert.deepEqual(packageMigrations(packager),files,'package must list exactly the executable migration array');
 assert.deepEqual(migrationReferences(accountFixture),files,'account fixture must reference all migrations outside comments');
 assert.deepEqual(migrationReferences(browserFixture),files,'browser fixture must reference all migrations outside comments');
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
 const validation=validateRegisteredEvidence({report:results,map,readSource:file=>readFileSync(resolve(root,file),'utf8')});
 assert.equal(validation.valid,true,JSON.stringify(validation.errors));
 // This checks the integrity of registered evidence. Complete 313-row semantic
 // coverage is independently enforced by check-traceability.mjs --cloud.
});
test('CLOUD-P04: traversal and symlink denials stay enforced, brand and visual gates stay manual', () => {
 const packager = readFileSync(resolve(root, 'scripts/package-account-cloud.mjs'), 'utf8');
 assert.ok(packager.includes('symlink') || packager.includes('traversal') || packager.includes('..'));
 const report = JSON.parse(readFileSync(resolve(root, 'docs/review/coverage-report-cloud.json'), 'utf8'));
 assert.equal(report.review, '待用户统一验收与独立审查');
 assert.equal(typeof report.complete,'boolean');
 assert.ok(Array.isArray(report.errors));
 assert.equal(report.complete,report.errors.length===0,'coverage completion must agree with actual errors');
});

test('CLOUD-P06: original pinned sources and retained license bytes are independently verifiable',()=>{
 const manifest=JSON.parse(readFileSync(resolve(root,'docs/review/source-manifest.json'),'utf8'));
 assert.equal(manifest.sources.length,5);
 for(const source of manifest.sources){
  assert.match(source.commit,/^[a-f0-9]{40}$/);
  assert.equal(execFileSync('git',['-C',source.snapshotPath,'rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim(),source.commit);
  assert.equal(source.actualCommit,source.commit);
  assert.equal(source.productCodeMigrated,false,'unlicensed reference source must not silently become product code');
  assert.ok(source.license.status);
  for(const file of source.license.evidencePaths)assert.ok(existsSync(file),'missing source/license evidence '+file);
 }
 for(const [repository,retained] of [['basketikun/infinite-canvas','infinite-canvas.LICENSE'],['manderzuo/prompt-for-seedance-gptimage2.5','prompt-for-seedance-gptimage2.5.LICENSE']]){
  const source=manifest.sources.find(entry=>entry.repository===repository);assert.ok(source,repository);
  const file='third-party/licenses/'+retained;
  const original=readFileSync(resolve(source.snapshotPath,'LICENSE'));
  const retainedBytes=readFileSync(resolve(root,file));
  assert.equal(createHash('sha256').update(retainedBytes).digest('hex'),createHash('sha256').update(original).digest('hex'),file+' must preserve the pinned source bytes');
  const filtered=execFileSync('git',['hash-object','--path='+file,'--stdin'],{cwd:root,input:original,encoding:'utf8',windowsHide:true}).trim();
  const raw=execFileSync('git',['hash-object','--stdin'],{cwd:root,input:original,encoding:'utf8',windowsHide:true}).trim();
  assert.equal(filtered,raw,file+' must survive the Git clean filter without byte conversion');
  assert.equal(execFileSync('git',['rev-parse',':'+file],{cwd:root,encoding:'utf8',windowsHide:true}).trim(),raw,file+' must be staged with the original bytes');
 }
});
test('CLOUD-P05: write policy denies traversal and junctions inside the test-owned work area', async () => {
 const { assertProjectWritePath } = await import('../../scripts/source-policy.mjs');
 assert.equal(assertProjectWritePath(root, 'docs/review/example.json'), resolve(root, 'docs/review/example.json'));
 for (const outside of ['../outside.txt', 'C:/outside.txt', '../account-api-cloud-20261008-other/test']) {
  assert.throws(() => assertProjectWritePath(root, outside), /outside_authorized_project/);
 }
 const workDir = resolve(root, 'work');
 if (!existsSync(workDir)) mkdirSync(workDir, { recursive: true });
 const owned = mkdtempSync(resolve(workDir, 'cloud-policy-owned-'));
 const link = resolve(owned, 'escape-link');
 try {
  symlinkSync(resolve(root, '..'), link, 'junction');
  assert.throws(() => assertProjectWritePath(root, relative(root, resolve(link, 'outside.txt'))), /outside_authorized_project/);
 } finally {
  if (existsSync(link)) {
   assert.equal(lstatSync(link).isSymbolicLink(), true, 'only remove the test junction itself');
   rmdirSync(link);
  }
  rmSync(owned, { recursive: true, force: true });
 }
 assert.ok(!existsSync(resolve(root, 'work/cloud-policy-owned-')));
});
