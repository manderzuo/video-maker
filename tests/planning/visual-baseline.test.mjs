import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
const load = () => existsSync('docs/design/visual-manifest.json') ? JSON.parse(readFileSync('docs/design/visual-manifest.json','utf8')) : {};
test('T02-C01: 23 pages account for empty/loading/normal/error states and 30 dialogs', () => {
 const v=load(); assert.equal(new Set(v.pages?.map(p=>p.id)).size,23);
 for(const page of v.pages) for(const state of ['empty','loading','normal','error']) {
  const entry=page.states.find(s=>s.state===state); assert.ok(entry,`${page.id}:${state}`);
  assert.ok(entry.capturePath && existsSync(entry.capturePath),`${page.id}:${state}: capture`);
 }
 assert.equal(new Set(v.dialogs?.map(p=>p.id)).size,30);
 for(const d of v.dialogs) assert.ok(existsSync(d.capturePath),d.id);
});
test('T02-C02: critical states have real captures at 1440/1280/1024 in both themes', () => {
 const v=load(); assert.ok(v.criticalStates?.length>0);
 for(const key of ['canvas-save-failed','canvas-readonly','prompt-conflict','video-confirmation','text-confirmation','submission-unknown']) {
  for(const width of [1440,1280,1024]) for(const theme of ['dark','light']) {
   const state=v.criticalStates.find(s=>s.key===key && s.viewport.width===width && s.theme===theme);
   assert.ok(state?.capturePath && existsSync(state.capturePath),`${key}:${width}:${theme}`);
  }
 }
});
test('T02-C03: payment and PG conflict material explicitly preserves constraints and gating', () => {
 const v=load(); assert.ok(v.dialogs?.length);
 for(const id of ['D05','PGD02','PGD03']) {
  const d=v.dialogs.find(d=>d.id===id); assert.ok(d?.capturePath && existsSync(d.capturePath),id);
 }
 assert.equal(v.businessControlsDisabled,true);
});
test('T02-C04: real browser review generated no business requests or storage writes', () => {
 const path='docs/review/logs/T02-browser-check.json'; assert.ok(existsSync(path),'browser evidence exists');
 const report=JSON.parse(readFileSync(path,'utf8'));
 assert.equal(report.businessRequests.length,0);
 assert.equal(report.blockedRequests.length,0);
 assert.equal(report.pageErrors.length,0);
 assert.equal(report.storageWrites.length,0);
 assert.equal(report.allBusinessButtonsDisabled,true);
 assert.ok(report.captureCount>=100);
});
test('T02-G02: human approval is required before the visual baseline is accepted', () => {
 const v=load(); assert.ok(v.criticalStates?.length>0,'critical states exist');
 for(const state of v.criticalStates) assert.equal(state.reviewDecision,'approved',`${state.key}: human visual review pending`);
 assert.equal(v.independentReviewDecision,'approved','independent review pending');
});
