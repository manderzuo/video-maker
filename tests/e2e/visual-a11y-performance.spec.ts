import {test,expect} from '../helpers/network-guard';
import {seedStudio} from '../helpers/seed-studio';
import {holdNextNativeCommit,nativeCommitProbe,releaseNativeCommit} from '../helpers/native-commit-hold';
import type {Run} from '../../src/domain/run';
async function canvas(page:import('@playwright/test').Page){await seedStudio(page,'unverified-capability');await page.evaluate(async()=>{const p='/tests/fixtures/generation.ts';await(await import(p)).seedGeneration();});await page.goto('/projects/p1/canvas');await page.evaluate(async()=>{const p='/tests/fixtures/generation.ts';await(await import(p)).connectGeneration();});}
test('T46-C02 a 767px actual narrow canvas has no enabled batch fee entry even with verified local capability and writer lease',async({page,networkCounter})=>{
 await page.setViewportSize({width:767,height:900});await canvas(page);await expect(page.locator('[data-interaction-id="C-16"]')).toBeDisabled();await page.getByLabel('选择 确认视频',{exact:true}).check();await expect(page.locator('[data-interaction-id="C-15"]')).toBeDisabled();expect(networkCounter.paidRequests).toHaveLength(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test.describe('actual touch context',()=>{
 test.use({hasTouch:true,viewport:{width:720,height:900}});
 test('T46 touch canvas action hit areas remain at least 44 CSS pixels without granting a paid execution',async({page,networkCounter})=>{
  await canvas(page);await page.getByLabel('选择 确认正文',{exact:true}).check();const targets=await page.locator('.node-action-bar button:not(:disabled)').evaluateAll(elements=>elements.map(element=>({text:element.textContent,width:element.getBoundingClientRect().width,height:element.getBoundingClientRect().height})));expect(targets.length).toBeGreaterThan(0);expect(targets.filter(t=>t.width<44||t.height<44)).toEqual([]);expect(networkCounter.paidRequests).toHaveLength(0);
 });
});
test('T46-C01 actual canvas has no document overflow at desktop visual breakpoints and preserves the approved 16px base',async({page,networkCounter})=>{
 for(const width of [1440,1280,1024]){await page.setViewportSize({width,height:900});await canvas(page);expect(await page.evaluate(()=>({fits:document.documentElement.scrollWidth<=innerWidth,font:getComputedStyle(document.body).fontSize}))).toEqual({fits:true,font:'16px'});await page.screenshot({path:'docs/review/screenshots/T46-initial-canvas-'+width+'.png'});}expect(networkCounter.paidRequests).toHaveLength(0);
});
test('T46-C02 resizing an open unsubmitted confirmation into narrow mode closes fee approval and updates batch controls immediately',async({page,networkCounter})=>{
 await canvas(page);await page.locator('[data-interaction-id="C-16"]').click();await expect(page.getByRole('dialog',{name:'生成确认单',exact:true})).toBeVisible();await page.setViewportSize({width:767,height:900});await expect(page.getByRole('dialog',{name:'生成确认单',exact:true})).toHaveCount(0);await expect(page.locator('[data-interaction-id="C-16"]')).toBeDisabled();expect(networkCounter.paidRequests).toHaveLength(0);
});
test('T46-C02 resizing during a real durable approval acknowledgment preserves the original record without dispatch or queue insertion',async({page,networkCounter})=>{
 await canvas(page);await page.getByTestId('node-video-1').locator('[data-interaction-id="V-08"]').click();const dialog=page.getByRole('dialog',{name:'生成确认单',exact:true});await dialog.getByLabel('我确认以上输入，并知悉可能消耗积分且金额未知').check();await holdNextNativeCommit(page,'runs');await dialog.getByRole('button',{name:'确认提交 1 项',exact:true}).click();await expect.poll(()=>nativeCommitProbe(page)).toMatchObject({nativeCommitted:true,awaitingDelivery:true});
 const records=()=>page.evaluate(async()=>{const p='/src/infrastructure/storage/database.ts',m=await import(p),db=await m.openStudioDb();try{return await m.transact(db,['runs','receipts'],'readonly',async(tx:IDBTransaction)=>({runs:await m.requestResult(tx.objectStore('runs').getAll()),queue:await m.requestResult(tx.objectStore('receipts').getAll())}));}finally{db.close();}}) as Promise<{runs:Run[];queue:unknown[]}>;
 const before=await records();before.queue=before.queue.filter((value)=>!!value&&typeof value==='object'&&'id' in value&&String(value.id).startsWith('queue:')); expect(before.runs).toHaveLength(1);expect(before.runs[0].executionState).toBe('persisted');expect(before.queue).toHaveLength(0);await page.setViewportSize({width:767,height:900});await expect(dialog).toHaveCount(0);await releaseNativeCommit(page);await expect(page.getByText('确认记录已保存 · 窄屏未提交，请保留原任务记录',{exact:true})).toBeVisible();const after=await records();after.queue=after.queue.filter((value)=>!!value&&typeof value==='object'&&'id' in value&&String(value.id).startsWith('queue:'));expect(after).toEqual(before);expect(networkCounter.paidRequests).toHaveLength(0);
});
