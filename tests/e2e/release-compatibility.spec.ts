import {test,expect} from '../helpers/network-guard';
test('T49 schema support matrix rejects invalid versions and retains newer data as readonly',async({page,networkCounter})=>{
 await page.goto('/projects');
 const decisions=await page.evaluate(async()=>{const path='/src/infrastructure/storage/release-compatibility.ts';const {canOpenSchema}=await import(path);return [1,2,0,-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1].map(canOpenSchema);});
 expect(decisions).toEqual([{mode:'writable',code:'supported'},{mode:'readonly',code:'schema_too_new'},...Array.from({length:6},()=>({mode:'unsupported',code:'schema_invalid'}))]);
 expect(networkCounter.requests.filter(r=>r.method==='POST')).toHaveLength(0);
});
test('T49 newer native project shows explicit preservation message with no editor or automatic submission',async({page,networkCounter})=>{
 await page.goto('/projects');await page.evaluate(async()=>{const p='/tests/fixtures/release-rehearsal.ts';await(await import(p)).prepareFutureProject();});
 await page.goto('/projects/p1/canvas');await expect(page.getByText('项目版本高于当前客户端，请使用兼容版本打开；原数据与任务记录已保留。',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'立即保存',exact:true})).toHaveCount(0);await page.reload();
 await expect(page.getByText('项目版本高于当前客户端，请使用兼容版本打开；原数据与任务记录已保留。',{exact:true})).toBeVisible();
 const rows=await page.evaluate(async()=>{const p='/tests/fixtures/release-rehearsal.ts';return(await import(p)).snapshot();});expect(rows.projects[0]).toMatchObject({schemaVersion:2,revision:7});expect(rows.runs[0]).toMatchObject({executionState:'future_pending',billingState:'reconcile_required'});expect(rows.promptRuns[0]).toMatchObject({executionState:'future_response_unknown'});
 expect(networkCounter.requests.filter(r=>r.method==='POST')).toHaveLength(0);await page.screenshot({path:'docs/review/screenshots/T49-newer-schema-preserved.png'});
});
