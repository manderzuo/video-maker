import {test,expect} from '../helpers/network-guard';
import {seedStudio} from '../helpers/seed-studio';
import type {Page} from '@playwright/test';
test.use({actionTimeout:2500});
test.setTimeout(20000);
test.beforeEach(async({page})=>{
 await page.goto('/projects');
 await page.evaluate(async()=>{const p='/tests/fixtures/generation.ts';await(await import(p)).seedGeneration();});
 await page.goto('/projects/p1/canvas');
 await expect(page.getByTestId('node-text-1').getByRole('textbox',{name:'节点文本',exact:true})).toBeEditable();
});
async function connect(page:Page){await page.evaluate(async()=>{const p='/tests/fixtures/generation.ts';(await import(p)).connectGeneration();});}
async function snapshot(page:Page){return page.evaluate(async()=>{const p='/src/infrastructure/storage/database.ts',m=await import(p);return m.withDatabase(undefined,(db:import('../../src/infrastructure/storage/database').StudioDb)=>m.transact(db,['graphs','runs','assets'],'readonly',async(tx:IDBTransaction)=>({graph:await m.requestResult(tx.objectStore('graphs').get('p1')),runs:await m.requestResult(tx.objectStore('runs').getAll()),assets:await m.requestResult(tx.objectStore('assets').getAll())})));});}
test('QA055 visible primary video entry stays inside node when its parameter body scrolls',async({page,networkCounter})=>{
 await connect(page);const node=page.getByTestId('node-video-1'),entry=node.getByRole('button',{name:'生成视频',exact:true});
 await expect(entry).toBeVisible({timeout:2500});await expect(entry).toHaveClass(/primary/);await expect(entry).toBeInViewport();
 const before=await snapshot(page);await node.locator('.node-body').evaluate(el=>{el.scrollTop=el.scrollHeight;});
 await expect(entry).toBeInViewport();const button=await entry.boundingBox(),body=await node.locator('.node-body').boundingBox();
 expect(button).not.toBeNull();expect(body).not.toBeNull();expect(button!.y).toBeGreaterThanOrEqual(body!.y);expect(button!.y+button!.height).toBeLessThanOrEqual(body!.y+body!.height+1);
 await entry.click();const dialog=page.getByRole('dialog',{name:'生成确认单',exact:true});await expect(dialog).toContainText('原创确认正文');await dialog.getByRole('button',{name:'返回编辑',exact:true}).click();
 expect(await snapshot(page)).toEqual(before);expect(networkCounter.paidRequests).toHaveLength(0);
});
test('QA055 named toolbar entries only preview selected or all videos and cancel without submission',async({page,networkCounter})=>{
 await connect(page);const selected=page.getByRole('button',{name:'生成选中视频',exact:true});await expect(selected).toBeVisible({timeout:2500});await expect(selected).toBeDisabled();
 await page.getByRole('checkbox',{name:'选择 确认正文',exact:true}).check();await expect(selected).toBeDisabled();await page.getByRole('checkbox',{name:'选择 确认视频',exact:true}).check();
 const before=await snapshot(page);for(const name of ['生成选中视频','批量生成视频']){await page.getByRole('button',{name,exact:true}).click();const dialog=page.getByRole('dialog',{name:'生成确认单',exact:true});await expect(dialog).toContainText('1 项');await expect(dialog).toContainText('金额未知');await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();expect(await snapshot(page)).toEqual(before);}
 expect(networkCounter.paidRequests).toHaveLength(0);expect(networkCounter.requests.filter(r=>['POST','PUT','PATCH','DELETE'].includes(r.method))).toHaveLength(0);
});
test('QA055 unverified video capability keeps an explained disabled generation entry visible',async({page,networkCounter})=>{
 await seedStudio(page,'unverified-capability');await page.goto('/projects/p1/canvas');const entry=page.getByTestId('node-video-1').getByRole('button',{name:'生成视频',exact:true});
 await expect(entry).toBeVisible({timeout:2500});await expect(entry).toBeDisabled();await expect(entry).toHaveAccessibleDescription(/视频能力尚未核验/);
 await expect(page.getByRole('button',{name:'批量生成视频',exact:true})).toBeDisabled();await expect(page.getByRole('dialog',{name:'生成确认单',exact:true})).not.toBeVisible();expect(networkCounter.paidRequests).toHaveLength(0);
});
test('QA055 visible entry with missing current credential explains blocker and never submits',async({page,networkCounter})=>{
 const before=await snapshot(page);await page.getByTestId('node-video-1').getByRole('button',{name:'生成视频',exact:true}).click();const dialog=page.getByRole('dialog',{name:'输入无效清单',exact:true});
 await expect(dialog).toBeVisible();await expect(dialog).toContainText('授权');await expect(page.getByRole('dialog',{name:'生成确认单',exact:true})).not.toBeVisible();await page.keyboard.press('Escape');expect(await snapshot(page)).toEqual(before);expect(networkCounter.paidRequests).toHaveLength(0);
});
test('QA055 fee acknowledgement enables confirmation only; toggling and returning preserves all records',async({page,networkCounter})=>{
 await connect(page);const before=await snapshot(page);await page.getByTestId('node-video-1').getByRole('button',{name:'生成视频',exact:true}).click();const dialog=page.getByRole('dialog',{name:'生成确认单',exact:true}),confirm=dialog.getByRole('button',{name:'确认提交 1 项',exact:true}),ack=dialog.getByLabel('我确认以上输入，并知悉可能消耗积分且金额未知',{exact:true});
 await expect(confirm).toBeDisabled();await ack.check();await expect(confirm).toBeEnabled();await ack.uncheck();await expect(confirm).toBeDisabled();await dialog.getByRole('button',{name:'返回编辑',exact:true}).click();
 expect(await snapshot(page)).toEqual(before);expect(networkCounter.paidRequests).toHaveLength(0);expect(networkCounter.requests.filter(r=>['POST','PUT','PATCH','DELETE'].includes(r.method))).toHaveLength(0);
});
test('QA055 locked video retains disabled generation button without hiding its purpose',async({page,networkCounter})=>{
 await connect(page);await page.getByRole('checkbox',{name:'选择 确认视频',exact:true}).check();await page.getByRole('button',{name:'锁定选中',exact:true}).click();
 const entry=page.getByTestId('node-video-1').getByRole('button',{name:'生成视频',exact:true});await expect(entry).toBeVisible({timeout:2500});await expect(entry).toBeDisabled();await expect(entry).toHaveAccessibleDescription(/只读或节点已锁定/);expect(networkCounter.paidRequests).toHaveLength(0);
});
