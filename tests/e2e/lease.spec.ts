import {test,expect} from '../helpers/network-guard';
import {seedStudio} from '../helpers/seed-studio';
test('F-01/F-02: real second tab is readonly; explicit takeover reloads and revokes first tab',async({page,context,networkCounter})=>{
 await page.goto('/tests/fixtures/storage.html');await seedStudio(page,'minimal-project');
 const other=await context.newPage();await other.goto('/tests/fixtures/storage.html');
 await expect(other.locator('#writer-state')).toContainText('只读');await expect(other.getByRole('button',{name:'事务保存',exact:true})).toBeDisabled();
 await other.getByRole('button',{name:'接管编辑…',exact:true}).click();await expect(other.getByRole('dialog')).toBeVisible();
 await expect(other.getByRole('button',{name:'接管编辑',exact:true})).toBeFocused();await other.getByRole('button',{name:'接管编辑',exact:true}).press('Tab');await expect(other.getByRole('button',{name:'取消',exact:true})).toBeFocused();
 await other.getByRole('button',{name:'取消',exact:true}).press('Escape');await expect(other.getByRole('dialog')).not.toBeVisible();await expect(other.getByRole('button',{name:'接管编辑…',exact:true})).toBeFocused();
 await other.getByRole('button',{name:'接管编辑…',exact:true}).click();await other.screenshot({path:'docs/review/screenshots/T06-takeover-dialog.png'});await other.getByRole('button',{name:'接管编辑',exact:true}).click();
 await expect(other.locator('#writer-state')).toContainText('可编辑');await expect(other.getByLabel('项目名称')).toHaveValue('测试项目');await expect(page.getByRole('button',{name:'事务保存',exact:true})).toBeDisabled();
 expect(networkCounter.paidRequests).toHaveLength(0);
});
test('lost broadcasts and paused heartbeat cannot bypass epoch guard with stale UI',async({page,context})=>{
 await page.goto('/tests/fixtures/storage.html');await seedStudio(page,'minimal-project');await page.evaluate(()=>window.studioFixture.stopCoordination());
 const other=await context.newPage();await other.goto('/tests/fixtures/storage.html');await other.getByRole('button',{name:'接管编辑…',exact:true}).click();await other.getByRole('button',{name:'接管编辑',exact:true}).click();await expect(other.locator('#writer-state')).toContainText('可编辑');
 await expect(page.getByRole('button',{name:'事务保存',exact:true})).toBeEnabled();await page.getByLabel('项目名称').fill('丢广播后的旧草稿');await page.getByRole('button',{name:'事务保存',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('lease_epoch_invalid');await expect(page.getByRole('button',{name:'事务保存',exact:true})).toBeDisabled();expect(await other.evaluate(async()=>(await window.studioFixture.readProject())?.title)).toBe('测试项目');
});
test('simulated sleeping clock denies old lease and lets a new tab acquire a higher epoch',async({page,context})=>{
 const start=Date.parse('2026-09-30T00:00:00Z');await page.clock.install({time:new Date(start)});await page.goto('/tests/fixtures/storage.html');await seedStudio(page,'minimal-project');await page.evaluate(()=>window.studioFixture.stopCoordination());
 const oldEpoch=await page.evaluate(()=>window.studioFixture.writer()?.epoch);await page.clock.setFixedTime(start+31001);expect(await page.evaluate(()=>window.studioFixture.staleWrite())).toEqual({status:'failed',code:'lease_expired_writer_denied'});
 const other=await context.newPage();await other.clock.install({time:new Date(start+31001)});await other.goto('/tests/fixtures/storage.html');expect(await other.evaluate(()=>window.studioFixture.writer()?.epoch)).toBeGreaterThan(oldEpoch??0);expect(await other.evaluate(async()=>(await window.studioFixture.readProject())?.revision)).toBe(1);
});
test('one native dispatch claim; committed intent survives project takeover and clock advance',async({page,context,networkCounter})=>{
 await page.goto('/tests/fixtures/storage.html');await seedStudio(page,'minimal-project');await page.evaluate(()=>window.studioFixture.prepareRun());
 const other=await context.newPage();await other.goto('/tests/fixtures/storage.html');
 const claims=await Promise.all([page.evaluate(()=>window.studioFixture.claim()),other.evaluate(()=>window.studioFixture.claim())]);expect(claims.filter(c=>c.ok)).toHaveLength(1);
 const owner=claims[0].ok?page:other,claim=claims.find(c=>c.ok);if(!claim?.ok)throw new Error('claim_missing');expect((await owner.evaluate(token=>window.studioFixture.markClaim(token),claim.token)).ok).toBe(true);
 await page.evaluate(()=>window.studioFixture.stopCoordination());await other.clock.install({time:new Date(Date.now()+60000)});await other.getByRole('button',{name:'接管编辑…',exact:true}).click();await other.getByRole('button',{name:'接管编辑',exact:true}).click();
 expect((await other.evaluate(()=>window.studioFixture.claim())).ok).toBe(false);const run=await other.evaluate(()=>window.studioFixture.readRun());expect(run?.idempotencyKey).toBe('fake-idempotency-r1');expect(run?.finalBody).toBe('{}');expect(run?.executionState).toBe('submitting');expect(networkCounter.paidRequests).toHaveLength(0);
});
