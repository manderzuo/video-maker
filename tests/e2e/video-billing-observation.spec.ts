import {test,expect} from '../helpers/network-guard';

test('QA28 gateway recovery is visibly pending, durable, unarchivable and only re-queries the original task',async({page,networkCounter},testInfo)=>{
 test.setTimeout(65000);
 await page.goto('/tasks');
 await page.evaluate(async()=>{const path='/tests/fixtures/task-history.ts';await(await import(path)).seedTaskHistory();});
 await page.reload();
 let recovered=false;
 await page.route('**/core-api/v1/videos/mock-core-1',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({request_id:'core-original-1',task:recovered?{id:'mock-core-1',status:'completed'}:{id:'mock-core-1',status:'failed',error:{billing_state:'pending',code:'bridge_recovery_required',http_status:503}}})}));
 await page.evaluate(async()=>{const path='/tests/fixtures/task-history.ts';(await import(path)).connectTaskHistory();});
 const row=page.getByTestId('video-run-1');
 await row.getByRole('checkbox').check();
 await page.getByRole('button',{name:'刷新所选已知任务',exact:true}).click();
 await expect(row).toContainText('账务待核对');
 await expect(row).toContainText('生成中 · 查询中断');
 await expect(row).not.toContainText('明确失败');
 await expect(row.getByRole('button',{name:'归档记录',exact:true})).toBeDisabled();
 await expect(page.getByRole('button',{name:'刷新所选已知任务',exact:true})).toBeEnabled();
 await row.getByRole('button',{name:'详情',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'任务详情',exact:true});
 await expect(dialog).toContainText('账务待核对');
 await dialog.getByRole('button',{name:'重新查询原任务',exact:true}).click();
 await expect(dialog).toContainText('没有创建新任务');
 await page.screenshot({path:testInfo.outputPath('gateway-recovery-pending-billing.png'),fullPage:true});
 await page.keyboard.press('Escape');
 await page.reload();
 await expect(page.getByTestId('video-run-1')).toContainText('账务待核对');
 recovered=true;
 await page.getByTestId('video-run-1').getByRole('checkbox').check();
 await expect(page.getByRole('button',{name:'刷新所选已知任务',exact:true})).toBeDisabled();
 // Reload cleared the in-memory credential. Restore the original binding before
 // its read-only recovery query; do not weaken the product's authorization gate.
 await page.evaluate(async()=>{const path='/tests/fixtures/task-history.ts';(await import(path)).connectTaskHistory();});
 await page.getByTestId('video-run-1').getByRole('checkbox').uncheck();
 await page.getByTestId('video-run-1').getByRole('checkbox').check();
 await expect(page.getByRole('button',{name:'刷新所选已知任务',exact:true})).toBeEnabled();
 // A refreshed document may have a new writer identity. Respect the persisted
 // lease until it expires; this read-only wait must not alter its owner or TTL.
 await expect.poll(()=>page.evaluate(async()=>{
  const path='/src/infrastructure/storage/database.ts';
  const m=await import(path);
  return m.withDatabase(undefined,(db:import('../../src/infrastructure/storage/database').StudioDb)=>m.transact(db,['leases'],'readonly',async(tx:IDBTransaction)=>{
   const lease=await m.requestResult(tx.objectStore('leases').get('dispatch:video-run-1'));
   return !lease||lease.expiresAt<=Date.now();
  }));
 }),{timeout:35000,intervals:[250,500,1000]}).toBe(true);
 await page.getByRole('button',{name:'刷新所选已知任务',exact:true}).click();
 const recoveryRead=await page.evaluate(async()=>{const path='/src/infrastructure/storage/database.ts',projectPath='/src/features/projects/project-service.ts',m=await import(path),p=await import(projectPath);return m.withDatabase(undefined,(db:import('../../src/infrastructure/storage/database').StudioDb)=>m.transact(db,['runs','leases','diagnostics'],'readonly',async(tx:IDBTransaction)=>{const run=await m.requestResult(tx.objectStore('runs').get('video-run-1')),lease=await m.requestResult(tx.objectStore('leases').get('dispatch:video-run-1')),summary=await m.requestResult(tx.objectStore('diagnostics').get('poll-summary:video-run-1'));return {executionState:run.executionState,queryState:run.queryState,billingState:run.billingState,writer:lease.tabId,currentTab:p.studioTabId,expiresAt:lease.expiresAt,now:Date.now(),errorCode:summary?.errorCode};}));});
 await testInfo.attach('recovery-read-state',{body:Buffer.from(JSON.stringify(recoveryRead)),contentType:'application/json'});
 await expect(page.getByTestId('video-run-1')).toContainText('视频已完成');
 await expect(page.getByTestId('video-run-1')).toContainText('账务待核对');
 expect(networkCounter.requests.filter(r=>r.url.endsWith('/v1/videos/mock-core-1')).length).toBeGreaterThanOrEqual(3);
 expect(networkCounter.requests.filter(r=>r.method==='POST')).toHaveLength(0);
});
