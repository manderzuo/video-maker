import {test,expect} from '../helpers/network-guard';
import {seedStudio} from '../helpers/seed-studio';
test.beforeEach(async({page})=>{await page.goto('/tests/fixtures/storage.html');await expect(page.getByRole('status')).toHaveText('尚无已保存版本');});
test('native commit ordering and refresh recovery with real clicks',async({page,networkCounter})=>{
 await page.getByLabel('项目名称').fill('真实浏览器中文保存');await page.getByRole('button',{name:'事务保存',exact:true}).click();await expect(page.getByRole('status')).toHaveText('已保存');
 expect(await page.evaluate(()=>window.studioFixture.events())).toEqual(['request-success','transaction-complete','reported-saved']);
 await expect(page.getByRole('button',{name:'检查提交门槛（不发请求）'})).toBeEnabled();
 await page.reload();await expect(page.getByRole('status')).toHaveText('已恢复已保存版本');await expect(page.getByLabel('项目名称')).toHaveValue('真实浏览器中文保存');
 expect(networkCounter.paidRequests).toHaveLength(0);await page.screenshot({path:'docs/review/screenshots/T05-native-storage.png'});
});
test('native request success plus abort rolls back all tables',async({page})=>{
 await seedStudio(page,'minimal-project');
 const result=await page.evaluate(async()=>{window.studioFixture.injectFault('abort');return window.studioFixture.saveSnapshot();});
 expect(result.status).toBe('failed');expect(await page.evaluate(async()=>(await window.studioFixture.readProject())?.revision)).toBe(1);
 expect(await page.evaluate(()=>window.studioFixture.rows('runs'))).toHaveLength(0);
 expect(await page.evaluate(()=>window.studioFixture.rows('diagnostics'))).toHaveLength(1);
});
test('quota fault preserves visible draft, disables submission and recovers saved title',async({page,networkCounter})=>{
 await seedStudio(page,'minimal-project');await page.getByLabel('项目名称').fill('失败仍保留的草稿');await page.getByRole('button',{name:'注入下一次配额失败'}).click();await page.getByRole('button',{name:'事务保存',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('storage_quota_exceeded');await expect(page.getByLabel('项目名称')).toHaveValue('失败仍保留的草稿');await expect(page.getByRole('button',{name:'检查提交门槛（不发请求）'})).toBeDisabled();
 await page.getByRole('button',{name:'重新读取已保存版本'}).click();await expect(page.getByLabel('项目名称')).toHaveValue('测试项目');expect(networkCounter.paidRequests).toHaveLength(0);
});
test('real old connection blocks native upgrade and yields actionable error',async({page})=>{
 await page.getByRole('button',{name:'检查旧连接阻塞'}).click();await expect(page.getByRole('status')).toHaveText('db_blocked_close_old_tabs');
});
test('persisted unknown run survives page reopening with original idempotency and state',async({page})=>{
 await seedStudio(page,'submit-unknown');await page.reload();
 const run=await page.evaluate(()=>window.studioFixture.readRun());expect(run?.executionState).toBe('submit_unknown');expect(run?.idempotencyKey).toBe('fake-idempotency-r1');expect(run?.authBindingId).toBe('binding-a');
});
