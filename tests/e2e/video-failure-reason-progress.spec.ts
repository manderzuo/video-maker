import {test,expect} from '../helpers/network-guard';
const reason='生成失败：上游判定参考图片可能包含真人，拒绝生成。';
for(const surface of ['tasks','canvas'] as const){
 test(`F0: ${surface} retains safe reason and code across billing, reopening and refresh`,async({page,networkCounter},testInfo)=>{
  let reads=0;let settle=false;
  await page.route('**/core-api/v1/videos/mock-core-1',route=>{reads++;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({request_id:'query-only-id',task:{id:'mock-core-1',status:'failed',error:{code:'video_execution_failed',billing_state:settle?'settled':'pending',...(settle?{}:{message:'FAKE_PRIVATE_LOG_DO_NOT_STORE <b>FAKE_SECRET</b>',upstream:{code:3003,message:'input image content[1] may contain real person'}})}}})});});
  await page.goto(surface==='tasks'?'/tasks':'/projects');
  await page.evaluate(async()=>{const path='/tests/fixtures/video-failure-reason.ts';await(await import(path)).seedVideoFailureHistory();});
  await page.reload();await page.evaluate(async()=>{const path='/tests/fixtures/task-history.ts';(await import(path)).connectTaskHistory();});
  if(surface==='canvas')await page.getByRole('link',{name:'测试项目',exact:true}).click();
  const target=surface==='tasks'?page.getByRole('dialog',{name:'任务详情',exact:true}):page.getByRole('region',{name:'执行队列'}).locator('li').filter({has:page.locator('[title="任务ID：video-run-1"]')});
  if(surface==='tasks')await page.getByTestId('video-run-1').getByRole('button',{name:'详情',exact:true}).click();
  await expect(target).toContainText(reason);await expect(target).toContainText('错误码：3003');await expect(target).toContainText('积分仍在核对，尚未确认最终扣费。');await expect(target).not.toContainText('FAKE_SECRET');
  if(surface==='canvas'){
   for(const width of [1280,768]){
    await page.setViewportSize({width,height:900});
    const bounds=await target.getByRole('alert').evaluate(node=>{const message=node.getBoundingClientRect(),list=node.closest('ul')!.getBoundingClientRect();return {messageBottom:message.bottom,listBottom:list.bottom,messageTop:message.top,listTop:list.top};});
    expect(bounds.messageBottom,'The cause, upstream code and billing must fit the visible queue').toBeLessThanOrEqual(bounds.listBottom);
    expect(bounds.messageTop).toBeGreaterThanOrEqual(bounds.listTop);
    if(width===768)await page.screenshot({path:testInfo.outputPath('f0-canvas-768-pending.png'),fullPage:true});
   }
   await page.setViewportSize({width:1280,height:900});
  }
  await page.screenshot({path:testInfo.outputPath(`f0-${surface}-pending.png`),fullPage:true});
  settle=true;await expect.poll(()=>reads,{timeout:16000}).toBeGreaterThanOrEqual(2);
  await expect(target).toContainText('Core 已确认积分结算');await expect(target).toContainText(reason);await expect(target).not.toContainText('积分仍在核对，尚未确认最终扣费。');
  if(surface==='tasks'){await target.getByRole('button',{name:'关闭任务详情',exact:true}).click();await page.getByTestId('video-run-1').getByRole('button',{name:'详情',exact:true}).click();}
  else{await page.goto('/projects');await page.getByRole('link',{name:'测试项目',exact:true}).click();}
  await expect(target).toContainText(reason);await expect(target).toContainText('错误码：3003');
  await page.reload();
  if(surface==='tasks')await page.getByTestId('video-run-1').getByRole('button',{name:'详情',exact:true}).click();
  await expect(target).toContainText(reason);await expect(target).toContainText('错误码：3003');await expect(target).toContainText('Core 已确认积分结算');
  const stored=await page.evaluate(async()=>{const path='/src/infrastructure/storage/database.ts';const m=await import(path);const db=await m.openStudioDb();try{return await m.transact(db,['runs','receipts','diagnostics'],'readonly',async(tx:IDBTransaction)=>({runs:await m.requestResult(tx.objectStore('runs').getAll()),receipts:await m.requestResult(tx.objectStore('receipts').getAll()),diagnostics:await m.requestResult(tx.objectStore('diagnostics').getAll())}));}finally{db.close();}});
  expect(stored.runs.find((run:{id:string})=>run.id==='video-run-1')).toMatchObject({executionState:'failed_confirmed',billingState:'settled',taskId:'mock-core-1',coreRequestId:'core-original-1',failure:{reasonCode:'video_reference_real_person_rejected',upstreamCode:'3003'}});
  const diagnosticExport=await page.evaluate(async()=>{const path='/src/security/diagnostic-export.ts';return (await(await import(path)).exportDiagnostics()).text();});
  expect(diagnosticExport).not.toMatch(/FAKE_PRIVATE_LOG|FAKE_SECRET|input image/);
  expect(JSON.stringify(stored)).not.toMatch(/FAKE_PRIVATE_LOG|FAKE_SECRET|input image/);expect(networkCounter.requests.filter(r=>r.method==='POST')).toHaveLength(0);
  await page.screenshot({path:testInfo.outputPath(`f0-${surface}-restored.png`),fullPage:true});
 });
}
