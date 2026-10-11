import {randomUUID} from 'node:crypto';
import {test,expect} from '../helpers/cloud-workspace-ui-fixture';
import type {Request} from '@playwright/test';
import type {fixture,Account} from '../../server/tests/account-fixture';

async function seed(workspace:Awaited<ReturnType<typeof fixture>>&{account:Account},title:string){
 const headers=workspace.headers(workspace.account),project=(await workspace.call('POST','/studio-api/projects',{...headers,payload:{title}})).json();
 const nodeId=randomUUID();
 expect((await workspace.call('POST','/studio-api/projects/'+project.id+'/commands',{...headers,payload:{expectedRevision:0,idempotencyKey:randomUUID(),command:{type:'operations',operations:[{id:randomUUID(),type:'add_node',payload:{node:{id:nodeId,type:'text',title:'TEST DATA',x:64,y:64,locked:false,data:{kind:'text',text:'Persisted 中文 English 123',referenceTokens:[]}}}}]}}})).statusCode).toBe(200);
 return {project,nodeId};
}

test('readable editing persists its existing viewport and subsequent text save across reload',async({page,workspace})=>{
 const {project}=await seed(workspace,'Readable persistence TEST DATA');
 await page.goto('/projects/'+project.id+'/canvas');
 const editor=page.locator('[data-interaction-id="cloud:canvas:node-text"]').first(),zoom=page.locator('[data-interaction-id="C-05"]');
 await zoom.fill('50');await zoom.press('Enter');
 await expect.poll(async()=>(await workspace.pool.query('SELECT graph FROM workspace_graphs WHERE project_id=$1',[project.id])).rows[0].graph.viewport.scale).toBe(.5);
 const before=(await workspace.pool.query('SELECT graph FROM workspace_graphs WHERE project_id=$1',[project.id])).rows[0].graph;
 let textUpdates=0;const listener=(request:Request)=>{if(request.method()==='POST'&&request.url().endsWith('/commands')&&request.postData()?.includes('update_node'))textUpdates++;};page.on('request',listener);
 await page.locator('[data-interaction-id="cloud:canvas:readable-edit"]').click();
 await expect(zoom).toHaveValue('100');await expect(editor).toBeFocused();
 await expect.poll(async()=>(await workspace.pool.query('SELECT graph FROM workspace_graphs WHERE project_id=$1',[project.id])).rows[0].graph.viewport.scale).toBe(1);
 const after=(await workspace.pool.query('SELECT graph FROM workspace_graphs WHERE project_id=$1',[project.id])).rows[0].graph;
 expect(after.nodes).toEqual(before.nodes);expect(after.revision).toBe(before.revision+1);expect(textUpdates).toBe(0);
 await page.reload();await expect(zoom).toHaveValue('100');await expect(editor).toHaveValue('Persisted 中文 English 123');
 await editor.fill('Subsequent saved 中文 English 456');
 await expect.poll(async()=>(await workspace.pool.query('SELECT graph FROM workspace_graphs WHERE project_id=$1',[project.id])).rows[0].graph.nodes[0].data.text).toBe('Subsequent saved 中文 English 456');
 await page.reload();await expect(editor).toHaveValue('Subsequent saved 中文 English 456');await expect(zoom).toHaveValue('100');
 expect(textUpdates).toBe(1);page.off('request',listener);expect(workspace.providerCalls).toHaveLength(0);
});

test('visible import disables during save and recovers failed upload without a fake asset, then persists',async({page,workspace})=>{
 const {project}=await seed(workspace,'Import states TEST DATA');
 await page.goto('/projects/'+project.id+'/canvas');
 const button=page.locator('[data-interaction-id="cloud:canvas:import-assets"]'),input=page.locator('[data-interaction-id="cloud:canvas:files"]');
 let release!:()=>void,entered!:()=>void;const waiting=new Promise<void>(resolve=>{entered=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/studio-api/projects/*/commands',async route=>{entered();await gate;await route.fallback();});
 try{
  await page.locator('[data-interaction-id="cloud:canvas:node-text"]').fill('Saving before import');await waiting;
  await expect(button).toBeDisabled();await expect(input).toBeDisabled();
 }finally{release();}
 await expect(button).toBeEnabled();await page.unroute('**/studio-api/projects/*/commands');
 let reject=true,rejected=0;
 await page.route('**/studio-api/assets',async route=>{if(reject&&route.request().method()==='POST'){rejected++;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'INTERNAL_ERROR'})});}else await route.fallback();});
 const png=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=8;return canvas.toDataURL('image/png').split(',')[1];});
 const payload={name:'EVIDENCE_TEST.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')};
 let choosing=page.waitForEvent('filechooser');await button.click();await (await choosing).setFiles(payload);
 await expect(page.getByRole('alert').first()).toBeVisible();expect(rejected).toBe(1);await expect(page.locator('.node-asset')).toHaveCount(0);await expect(input).toHaveValue('');
 expect((await workspace.pool.query('SELECT id FROM workspace_assets')).rows).toHaveLength(0);
 reject=false;choosing=page.waitForEvent('filechooser');await button.click();await (await choosing).setFiles(payload);
 await expect(page.locator('.node-asset')).toHaveCount(1);await expect(page.getByRole('status').first()).toContainText('已保存');await expect(input).toHaveValue('');
 const before=(await workspace.pool.query('SELECT graph FROM workspace_graphs WHERE project_id=$1',[project.id])).rows[0].graph;
 expect((await workspace.pool.query('SELECT id FROM workspace_assets')).rows).toHaveLength(1);
 await page.reload();await expect(page.locator('.node-asset img')).toHaveCount(1);
 expect((await workspace.pool.query('SELECT graph FROM workspace_graphs WHERE project_id=$1',[project.id])).rows[0].graph).toEqual(before);
 expect(workspace.providerCalls).toHaveLength(0);
});

test('activity view switches remain available during reads and reset locally without deleting persisted receipts',async({page,workspace})=>{
 await seed(workspace,'Activity pending TEST DATA');
 const before=(await workspace.pool.query('SELECT id FROM workspace_command_receipts')).rows;
 let release!:()=>void,entered!:()=>void;const waiting=new Promise<void>(resolve=>{entered=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/studio-api/activity*',async route=>{entered();await gate;await route.fallback();});
 await page.goto('/activity');
 const receipts=page.locator('[data-interaction-id="cloud:activity:view-receipts"]'),operations=page.locator('[data-interaction-id="cloud:activity:view-operations"]');
 try{
  await waiting;await expect(receipts).toBeEnabled();await receipts.click();await expect(page.locator('article')).toHaveCount(1);
  await expect(operations).toBeEnabled();await operations.click();await expect(receipts).toBeEnabled();
 }finally{release();}
 await expect(page.locator('article')).toHaveCount(2);
 await receipts.click();await expect(operations).toBeVisible();await page.reload();
 await expect(receipts).toBeVisible();await expect(operations).toHaveCount(0);await expect(page.locator('article')).toHaveCount(2);
 await receipts.click();await expect(page.locator('article')).toHaveCount(1);
 expect((await workspace.pool.query('SELECT id FROM workspace_command_receipts')).rows).toEqual(before);expect(workspace.providerCalls).toHaveLength(0);
});

test('activity view switches permit recovery from each view read failure without modifying cloud records',async({page,workspace})=>{
 const {project}=await seed(workspace,'Activity failure TEST DATA');
 const before=(await workspace.pool.query('SELECT id FROM workspace_command_receipts')).rows;
 let failOperations=true,failReceipts=true;
 await page.route('**/studio-api/activity*',async route=>{if(failOperations)await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'INTERNAL_ERROR'})});else await route.fallback();});
 await page.route('**/studio-api/projects/'+project.id+'/receipts*',async route=>{if(failReceipts)await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'INTERNAL_ERROR'})});else await route.fallback();});
 await page.goto('/activity');
 const receipts=page.locator('[data-interaction-id="cloud:activity:view-receipts"]'),operations=page.locator('[data-interaction-id="cloud:activity:view-operations"]');
 await expect(page.getByRole('alert').first()).toBeVisible();await expect(receipts).toBeEnabled();await receipts.click();
 await expect(page.getByRole('alert').first()).toBeVisible();await expect(operations).toBeEnabled();await operations.click();await expect(page.getByRole('alert').first()).toBeVisible();
 failOperations=false;await page.locator('[data-interaction-id="cloud:activity:reload"]').click();await expect(page.locator('article')).toHaveCount(2);await expect(page.getByRole('alert')).toHaveCount(0);
 failReceipts=false;await receipts.click();await expect(page.locator('article')).toHaveCount(1);await expect(page.getByRole('alert')).toHaveCount(0);
 expect((await workspace.pool.query('SELECT id FROM workspace_command_receipts')).rows).toEqual(before);expect(workspace.providerCalls).toHaveLength(0);
});
