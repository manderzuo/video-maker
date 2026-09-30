import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';

const manifestPath = 'docs/review/source-manifest.json';
const readManifest = () => existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
test('T01-C01: resolved project belongs to the authorized TRAEWORK root', () => {
  const m = readManifest();
  assert.equal(m.target?.relativePath, 'TRAEWORK/aiwork-studio');
  assert.equal(resolve(m.target.absolutePath), resolve('E:/trae-studio/TRAEWORK/aiwork-studio'));
  assert.equal(m.target.writable, true);
});
test('T01-C02: all five pinned revisions have independently verified snapshots', () => {
  const m = readManifest();
  assert.equal(m.sources?.length, 5);
  for (const s of m.sources) {
    assert.match(s.commit, /^[a-f0-9]{40}$/);
    assert.equal(s.actualCommit, s.commit);
    assert.equal(s.snapshotStatus, 'verified');
    assert.ok(existsSync(resolve(s.snapshotPath)));
    assert.equal(s.productCodeMigrated, false);
  }
});
test('T01-C03: every source has a license disposition and evidence', () => {
  const m = readManifest();
  assert.equal(m.sources?.length, 5);
  for (const s of m.sources) {
    assert.ok(s.license?.status);
    assert.ok(s.license.evidencePaths.length > 0);
    for (const p of s.license.evidencePaths) assert.ok(existsSync(p), p);
  }
});
test('T01-C04: canvas MIT copyright remains byte-for-byte in third-party evidence', () => {
  const m = readManifest();
  const source = m.sources?.find(s => s.repository === 'basketikun/infinite-canvas');
  assert.ok(source, 'canvas source is registered');
  const original = readFileSync(resolve(source.snapshotPath, 'LICENSE'), 'utf8');
  const retained = readFileSync('third-party/licenses/infinite-canvas.LICENSE', 'utf8');
  assert.equal(retained, original);
  assert.ok(readFileSync('third-party/THIRD_PARTY_NOTICES.txt', 'utf8').includes(original));
  assert.equal(source.license.frontendMarkReleaseGate, 'unresolved');
});
test('T01-C05: write policy denies external/source paths, traversal and symlinks', async () => {
  assert.ok(existsSync('scripts/source-policy.mjs'), 'workspace write guard is implemented');
  const { assertProjectWritePath, readSourceManifest } = await import('../../scripts/source-policy.mjs');
  const root = resolve('E:/trae-studio/TRAEWORK/aiwork-studio');
  assert.equal(readSourceManifest(root).target.relativePath, 'TRAEWORK/aiwork-studio');
  assert.equal(assertProjectWritePath(root, 'docs/review/example.json'), resolve(root, 'docs/review/example.json'));
  for (const path of ['../outside.txt', 'E:/trae-studio/sources/anything', 'C:/outside.txt', '../aiwork-studio-other/test']) {
    assert.throws(() => assertProjectWritePath(root, path), /outside_authorized_project/);
  }
  assert.throws(() => assertProjectWritePath(resolve(root, '..'), 'outside.txt'), /outside_authorized_project/);
  const { mkdirSync, symlinkSync, rmdirSync, lstatSync, mkdtempSync } = await import('node:fs');
  const external = resolve(root, 'work/external-fixture');
  const link = resolve(root, 'work/escape-link');
  mkdirSync(external, { recursive: true });
  if (existsSync(link)) {
    assert.equal(lstatSync(link).isSymbolicLink(), true, 'only remove the test junction itself');
    rmdirSync(link);
  }
  symlinkSync(resolve(root, '..'), link, 'junction');
  try { assert.throws(() => assertProjectWritePath(root, relative(root, resolve(link, 'outside.txt'))), /outside_authorized_project/); }
  finally { rmdirSync(link); }
  // This test-owned directory is inside work/, so a broken guard never touches user files.
  const otherRoot = mkdtempSync(resolve(root, 'work/policy-other-root-'));
  const { spawnSync } = await import('node:child_process');
  const run = spawnSync(process.execPath, [resolve(root, 'scripts/freeze-sources.mjs')], { cwd: otherRoot, encoding: 'utf8' });
  assert.equal(run.status, 1, 'freeze CLI must refuse a caller-supplied working directory');
  assert.match(run.stderr, /outside_authorized_project/);
  assert.equal(existsSync(resolve(otherRoot, 'docs')), false, 'deny before any write');
});
