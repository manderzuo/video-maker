import {test,expect} from '../helpers/network-guard';

test('QA32 a fast task update never aborts the slower query for another original canvas run',async({page,networkCounter})=>{
 test.setTimeout(35000);
 let fastQueries=0,slowQueries=0;
 await page.route('**/core-api/v1/videos/mock-core-1',route=>{
  fastQueries++;
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({task:{id:'mock-core-1',status:'processing'}})});
 });
 await page.route('**/core-api/v1/videos/mock-core-slow',async route=>{
  slowQueries++;
  await new Promise(resolve=>setTimeout(resolve,6000));
  try{await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({task:{id:'mock-core-slow',status:'completed'}})});}catch{/* The red implementation cancels this query; persisted completion must still be asserted. */}
 });
 await page.goto('/projects');
 await page.evaluate(async()=>{
  const historyPath='/tests/fixtures/task-history.ts';await (await import(historyPath)).seedTaskHistory();
  const dbPath='/src/infrastructure/storage/database.ts',m=await import(dbPath),db=await m.openStudioDb();
  try{await m.transact(db,['runs','leases'],'readwrite',async(tx:IDBTransaction)=>{
   const run=await m.requestResult(tx.objectStore('runs').get('video-run-1'));
   tx.objectStore('runs').put({...run,id:'video-run-slow',taskId:'mock-core-slow',coreRequestId:'core-slow',idempotencyKey:'original-slow-idempotency'});
   const lease=await m.requestResult(tx.objectStore('leases').get('dispatch:video-run-1'));
   tx.objectStore('leases').put({...lease,id:'dispatch:video-run-slow',runId:'video-run-slow'});
  });}finally{db.close();}
 });
 await page.reload();
 await page.evaluate(async()=>{const path='/tests/fixtures/task-history.ts';(await import(path)).connectTaskHistory();});
 await page.getByRole('link',{name:'测试项目',exact:true}).click();
 await expect(page.getByTestId('canvas-stage')).toBeVisible();
 await expect.poll(()=>fastQueries,{timeout:16000}).toBeGreaterThan(1);
 await expect.poll(()=>page.evaluate(async()=>{const path='/tests/fixtures/task-history.ts';const state=await (await import(path)).taskHistoryState();return state.runs.find((run:{id:string})=>run.id==='video-run-slow')?.executionState;}),{timeout:16000}).toBe('succeeded');
 const state=await page.evaluate(async()=>{const path='/tests/fixtures/task-history.ts';return (await import(path)).taskHistoryState();});
 expect(state.runs.find((run:{id:string})=>run.id==='video-run-slow')).toMatchObject({taskId:'mock-core-slow',coreRequestId:'core-slow',idempotencyKey:'original-slow-idempotency'});
 expect(slowQueries).toBe(1);
 expect(networkCounter.requests.filter(request=>request.method==='POST')).toHaveLength(0);
});
