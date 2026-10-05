import {test,expect} from '../helpers/network-guard';

test('QA53 queue shows the node name and a stable timestamp video number without replacing stored IDs',async({page,networkCounter})=>{
 await page.goto('/projects');
 const before=await page.evaluate(async()=>{
  const path='/tests/fixtures/pending-queue.ts',fixture=await import(path),ids=await fixture.seedPendingQueue();
  const database='/src/infrastructure/storage/database.ts',d=await import(database);
  await d.withDatabase(undefined,(db:import('../../src/infrastructure/storage/database').StudioDb)=>d.transact(db,['runs'],'readwrite',async(tx:IDBTransaction)=>{const run=await d.requestResult(tx.objectStore('runs').get(ids.runId));tx.objectStore('runs').put({...run,createdAt:Date.parse('2026-10-05T01:30:15Z')});}));
  return fixture.pendingQueueState();
 });
 await page.goto('/projects/p1/canvas');const controls=page.getByRole('region',{name:'执行队列'});
 await expect(controls).toContainText('确认视频 · 待提交');
 await expect(controls).toContainText('视频-20261005-093015-');
 await expect(controls).not.toContainText('video-1');
 const label=await controls.locator('li').innerText();await page.reload();await expect(controls.locator('li')).toHaveText(label);
 const after=await page.evaluate(async()=>{const path='/tests/fixtures/pending-queue.ts';return(await import(path)).pendingQueueState();});
 expect(after.runs).toEqual(before.runs);expect(networkCounter.paidRequests).toHaveLength(0);
});

test('QA53 historical result nodes show timestamp video numbers while preserving original source bindings',async({page,networkCounter})=>{
 await page.goto('/projects');await page.evaluate(async()=>{const path='/tests/fixtures/result-review.ts';await(await import(path)).seedResultReview();});
 await page.goto('/projects/p1/canvas');
 await expect(page.getByText(/视频-\d{8}-\d{6}-R1/, {exact:true})).toBeVisible();
 await expect(page.getByText('任务 r1',{exact:true})).not.toBeVisible();
 const stored=await page.evaluate(async()=>{const path='/tests/fixtures/result-review.ts';return(await import(path)).reviewStoredState();});
 expect(stored.graph.nodes.find((n:{type:string})=>n.type==='result').data.runId).toBe('r1');
 expect(stored.runs.find((r:{id:string})=>r.id==='r1').resultAssetId).toBe('result-asset-1');
 expect(networkCounter.paidRequests).toHaveLength(0);
});
