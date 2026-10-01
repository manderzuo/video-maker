import {test,expect} from '../helpers/network-guard';
import {seedStudio} from '../helpers/seed-studio';
import type {Page} from '@playwright/test';
const state=(page:Page)=>page.evaluate(async()=>{const url='/src/infrastructure/storage/database.ts',m=await import(url),db=await m.openStudioDb();try{return await m.transact(db,['projects','graphs','runs','diagnostics'],'readonly',async(tx:IDBTransaction)=>({projects:await m.requestResult(tx.objectStore('projects').getAll()),graph:await m.requestResult(tx.objectStore('graphs').get('p1')),runs:await m.requestResult(tx.objectStore('runs').getAll()),fonts:await m.requestResult(tx.objectStore('diagnostics').get('fonts:p1'))}));}finally{db.close();}});
test.beforeEach(async({page})=>{await seedStudio(page,'unverified-capability');await page.goto('/projects/p1/canvas');await expect(page.getByTestId('node-text-1').getByLabel('节点文本')).toBeEditable();});

test('T44 T02 denied native font preference retains creative text and warns before reload restores saved display preference',async({page,networkCounter})=>{
 const before=await state(page),node=page.getByTestId('node-text-1');await page.evaluate(()=>{const original=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args:Parameters<typeof original>){if(this.name==='diagnostics'&&(args[0] as {id?:string}).id==='fonts:p1')throw new DOMException('native-font-quota','QuotaExceededError');return original.apply(this,args);};});
 await node.getByLabel('文本字号',{exact:true}).selectOption('20');await expect(node.getByLabel('节点文本',{exact:true})).toHaveCSS('font-size','20px');await expect(page.getByRole('alert')).toHaveText('字号偏好未保存。');expect(await state(page)).toEqual(before);await page.reload();await expect(node.getByLabel('文本字号',{exact:true})).toHaveValue('16');await expect(node.getByLabel('节点文本',{exact:true})).toHaveValue('原创镜头');expect(await state(page)).toEqual(before);expect(networkCounter.paidRequests).toHaveLength(0);
});

test('T44 N14/N15/N16 each native input edge commit failure preserves original dependency order and every immutable Run',async({page,networkCounter})=>{
 const node=page.getByTestId('node-video-1'),picker=page.getByRole('dialog',{name:'选择输入',exact:true});
 for(const action of ['connect','disconnect','reorder']){
  if(action==='disconnect'){
   await node.getByRole('button',{name:'选择输入',exact:true}).click();await picker.getByRole('button',{name:'连接 参考一',exact:true}).click();await expect(node.getByTestId('input-list').locator('li')).toHaveCount(1);
  }
  const before=await state(page);await page.evaluate(()=>{const original=IDBObjectStore.prototype.put;let armed=true;IDBObjectStore.prototype.put=function(...args:Parameters<typeof original>){if(armed&&this.name==='graphs'){armed=false;throw new DOMException('native-input-edge-quota','QuotaExceededError');}return original.apply(this,args);};});
  if(action==='connect'){await node.getByRole('button',{name:'选择输入',exact:true}).click();await picker.getByRole('button',{name:'连接 参考二',exact:true}).click();}
  else if(action==='disconnect')await node.getByRole('button',{name:'断开 参考一',exact:true}).click();
  else await node.getByRole('button',{name:'上移 参考二',exact:true}).click();
  await expect(page.locator('.canvas-heading [role="status"]')).toContainText('尚未保存');expect(await state(page)).toEqual(before);await page.reload();await expect(node.getByTestId('input-list').locator('li')).toHaveCount(before.graph.edges.length);
  if(action==='disconnect'){await node.getByRole('button',{name:'选择输入',exact:true}).click();await picker.getByRole('button',{name:'连接 参考二',exact:true}).click();await expect(node.getByTestId('input-list').locator('li')).toHaveCount(2);}
 }
 expect(networkCounter.paidRequests).toHaveLength(0);
});
