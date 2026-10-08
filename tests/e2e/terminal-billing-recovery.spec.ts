import {test,expect} from '../helpers/network-guard';

for(const surface of ['tasks','canvas'] as const){
 test(`QA58 ${surface} continues original-task billing reconciliation after terminal failure`,async({page,networkCounter},testInfo)=>{
  let reads=0;
  await page.route('**/core-api/v1/videos/mock-core-1',route=>{
   const billing=++reads===1?'pending':'settled';
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({request_id:'query-only-id',task:{id:'mock-core-1',status:'failed',error:{code:'budget_policy_expired',billing_state:billing,message:'PRIVATE_PROVIDER_TEXT'}}})});
  });
  await page.goto(surface==='tasks'?'/tasks':'/projects');
  await page.evaluate(async()=>{const path='/tests/fixtures/task-history.ts';await(await import(path)).seedTaskHistory();});
  await page.reload();
  await page.evaluate(async()=>{const path='/tests/fixtures/task-history.ts';(await import(path)).connectTaskHistory();});
  if(surface==='canvas')await page.getByRole('link',{name:'测试项目',exact:true}).click();
  await expect.poll(()=>reads,{timeout:16000}).toBeGreaterThanOrEqual(2);
  const saved=await page.evaluate(async()=>{const path='/tests/fixtures/task-history.ts';const state=await(await import(path)).taskHistoryState();return state.runs.find((run:{id:string})=>run.id==='video-run-1');});
  expect(saved).toMatchObject({executionState:'failed_confirmed',billingState:'settled',taskId:'mock-core-1',coreRequestId:'core-original-1'});
  if(surface==='tasks'){
   const row=page.getByTestId('video-run-1');
   await expect(row).toContainText('Core记录结算');
   await row.getByRole('button',{name:'详情',exact:true}).click();
   const dialog=page.getByRole('dialog',{name:'任务详情',exact:true});
   await expect(dialog).toContainText('预算');
   await expect(dialog).not.toContainText('PRIVATE_PROVIDER_TEXT');
  }
  expect(networkCounter.requests.filter(request=>request.method==='POST')).toHaveLength(0);
  await page.screenshot({path:testInfo.outputPath(`terminal-billing-${surface}.png`),fullPage:true});
 });
}

test('QA58 terminal billing tracking can be explicitly stopped without canceling or resubmitting',async({page,networkCounter})=>{
 await page.route('**/core-api/v1/videos/mock-core-1',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({task:{id:'mock-core-1',status:'failed',error:{code:'video_execution_failed',billing_state:'pending'}}})}));
 await page.goto('/tasks');
 await page.evaluate(async()=>{const path='/tests/fixtures/task-history.ts';await(await import(path)).seedTaskHistory();});
 await page.reload();
 await page.evaluate(async()=>{const path='/tests/fixtures/task-history.ts';(await import(path)).connectTaskHistory();});
 const row=page.getByTestId('video-run-1');
 await expect(row).toContainText('账务待核对');
 await row.getByRole('button',{name:'详情',exact:true}).click();
 const stop=page.getByRole('button',{name:'停止本地查询',exact:true});
 await expect(stop).toBeEnabled();
 await stop.click();
 const saved=await page.evaluate(async()=>{const path='/tests/fixtures/task-history.ts';return (await(await import(path)).taskHistoryState()).runs.find((run:{id:string})=>run.id==='video-run-1');});
 expect(saved).toMatchObject({executionState:'failed_confirmed',billingState:'pending_reconciliation',queryState:'paused_by_user',taskId:'mock-core-1'});
 expect(networkCounter.requests.filter(request=>request.method==='POST')).toHaveLength(0);
});
