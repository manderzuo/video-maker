import {test,expect} from '../helpers/network-guard';
import {seedStudio} from '../helpers/seed-studio';
import type {Page} from '@playwright/test';
const stored=(page:Page)=>page.evaluate(async()=>{
 const path='/src/infrastructure/storage/database.ts',m=await import(path);
 return m.withDatabase(undefined,(db:import('../../src/infrastructure/storage/database').StudioDb)=>m.transact(db,['graphs','runs'],'readonly',async(tx:IDBTransaction)=>({graph:await m.requestResult(tx.objectStore('graphs').get('p1')),runs:await m.requestResult(tx.objectStore('runs').getAll())})));
});
async function drag(page:Page,dx:number,dy:number,release=true){
 const handle=page.getByTestId('node-asset-1').getByRole('button',{name:'调整节点大小 参考一',exact:true}),b=await handle.boundingBox();expect(b).not.toBeNull();
 await page.mouse.move(b!.x+b!.width/2,b!.y+b!.height/2);await page.mouse.down();await page.mouse.move(b!.x+b!.width/2+dx,b!.y+b!.height/2+dy,{steps:6});if(release)await page.mouse.up();
}
test.beforeEach(async({page})=>{
 await seedStudio(page,'unverified-capability');
 await page.evaluate(async()=>{
  const path='/src/infrastructure/storage/database.ts',m=await import(path),db=await m.openStudioDb();
  const canvas=document.createElement('canvas');canvas.width=160;canvas.height=320;const ctx=canvas.getContext('2d')!;
  ctx.fillStyle='#2a7eaa';ctx.fillRect(0,0,160,320);ctx.fillStyle='#fff';ctx.fillRect(10,10,140,300);ctx.fillStyle='#2a7eaa';ctx.fillRect(30,70,100,180);
  const blob=await new Promise<Blob>(resolve=>canvas.toBlob(b=>resolve(b!),'image/png'));
  try{await m.transact(db,['graphs','assets','blobs'],'readwrite',async(tx:IDBTransaction)=>{
   const graph=await m.requestResult(tx.objectStore('graphs').get('p1'));graph.nodes=graph.nodes.filter((n:{id:string})=>['asset-1','video-1','text-1','result-1'].includes(n.id));
   for(const node of graph.nodes){node.x=node.id==='asset-1'?20:node.id==='video-1'?660:node.id==='text-1'?1100:1580;node.y=20;}tx.objectStore('graphs').put(graph);
   const asset=await m.requestResult(tx.objectStore('assets').get('a1'));tx.objectStore('assets').put({...asset,bytes:blob.size,width:160,height:320});tx.objectStore('blobs').put({id:asset.blobKey,blob});
  });}finally{db.close();}
 });
 await page.goto('/projects/p1/canvas');await page.getByLabel('选择 参考一',{exact:true}).check();
});
test('dragging a reference border grows the whole image preview and keeps wires attached through save, undo, redo and reload',async({page,networkCounter},testInfo)=>{
 const node=page.getByTestId('node-asset-1');await expect(node.locator('img')).toBeVisible();
 await node.getByRole('button',{name:'输出图片',exact:true}).click();await page.getByTestId('node-video-1').getByRole('button',{name:'接收图片',exact:true}).click();
 const before=await stored(page),oldPreview=await node.locator('.canvas-asset-preview').boundingBox();await page.getByLabel('选择 参考一',{exact:true}).check();await drag(page,160,260);
 await expect.poll(async()=>(await stored(page)).graph.nodes.find((n:{id:string})=>n.id==='asset-1').size).toEqual({width:480,height:460});
 const next=await stored(page);expect(next.graph.edges).toEqual(before.graph.edges);expect(next.runs).toEqual(before.runs);expect(next.graph.nodes.find((n:{id:string})=>n.id==='video-1')).toEqual(before.graph.nodes.find((n:{id:string})=>n.id==='video-1'));
 const preview=await node.locator('.canvas-asset-preview').boundingBox();expect(preview!.height).toBeGreaterThan(oldPreview!.height+100);expect(await node.locator('img').evaluate(e=>getComputedStyle(e).objectFit)).toBe('contain');
 const out=await node.getByRole('button',{name:'输出图片',exact:true}).boundingBox(),box=await node.boundingBox();expect(Math.abs(out!.x+out!.width/2-box!.x-box!.width)).toBeLessThan(4);
 await page.getByRole('button',{name:'撤销',exact:true}).click();await expect.poll(async()=>(await stored(page)).graph.nodes.find((n:{id:string})=>n.id==='asset-1').size).toBeUndefined();
 await page.getByRole('button',{name:'重做',exact:true}).click();await expect.poll(async()=>(await stored(page)).graph.nodes.find((n:{id:string})=>n.id==='asset-1').size).toEqual({width:480,height:460});
 await page.reload();await expect(node).toHaveCSS('width','480px');await expect(node).toHaveCSS('height','460px');expect(networkCounter.paidRequests).toHaveLength(0);
 await page.screenshot({path:testInfo.outputPath('resized-reference.png')});
});
test('resizing at 50 percent uses world units; keyboard border control saves an additional dimension change',async({page,networkCounter})=>{
 await page.getByLabel('缩放百分比',{exact:true}).fill('50');await page.getByLabel('缩放百分比',{exact:true}).press('Enter');const before=await stored(page);await drag(page,120,90);
 await expect.poll(async()=>(await stored(page)).graph.nodes.find((n:{id:string})=>n.id==='asset-1').size).toEqual({width:560,height:380});
 await page.getByTestId('node-asset-1').getByRole('button',{name:'调整节点宽度 参考一',exact:true}).press('ArrowRight');
 await expect.poll(async()=>(await stored(page)).graph.nodes.find((n:{id:string})=>n.id==='asset-1').size).toEqual({width:570,height:380});
 const after=await stored(page);expect(after.graph.nodes.find((n:{id:string})=>n.id==='asset-1')).toMatchObject({x:20,y:20});expect(after.runs).toEqual(before.runs);expect(networkCounter.paidRequests).toHaveLength(0);
});
test('Escape and pointer cancellation discard a resize preview without saving a revision or execution',async({page,networkCounter})=>{
 const before=await stored(page);await drag(page,160,200,false);await expect(page.getByTestId('node-asset-1')).toHaveCSS('width','480px');await page.keyboard.press('Escape');await page.mouse.up();expect(await stored(page)).toEqual(before);await expect(page.getByTestId('node-asset-1')).toHaveCSS('width','320px');
 await drag(page,80,120,false);await page.getByTestId('node-asset-1').getByRole('button',{name:'调整节点大小 参考一',exact:true}).dispatchEvent('pointercancel');await page.mouse.up();expect(await stored(page)).toEqual(before);expect(networkCounter.paidRequests).toHaveLength(0);
});
test('locked nodes expose no resizing controls and minimum dimensions keep a valid saved node',async({page})=>{
 await drag(page,-300,-150);await expect.poll(async()=>(await stored(page)).graph.nodes.find((n:{id:string})=>n.id==='asset-1').size).toEqual({width:160,height:160});
 await page.getByRole('button',{name:'锁定选中',exact:true}).click();await expect(page.getByTestId('node-asset-1').getByRole('button',{name:/调整节点/})).toHaveCount(0);await expect(page.getByTestId('node-asset-1').getByTestId('node-handle')).toContainText('已锁定');
});
test('native save failure rolls back the visible resize and retains the requested dimensions for recovery',async({page,networkCounter})=>{
 const before=await stored(page);await page.evaluate(()=>{const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args:Parameters<typeof put>){if(this.name==='graphs'){IDBObjectStore.prototype.put=put;throw new DOMException('resize-quota-abort','QuotaExceededError');}return put.apply(this,args);};});
 await drag(page,160,200);await expect(page.locator('.canvas-heading [role="status"]')).toContainText('尚未保存');expect(await stored(page)).toEqual(before);await expect(page.getByTestId('node-asset-1')).toHaveCSS('width','320px');
 const recovery=await page.evaluate(async()=>{const path='/src/features/recovery/memory-recovery.ts';return(await import(path)).readMemoryRecoveries();});expect(recovery.find((r:{project:{id:string}})=>r.project.id==='p1').graph.nodes.find((n:{id:string})=>n.id==='asset-1').size).toEqual({width:480,height:400});expect(networkCounter.paidRequests).toHaveLength(0);
});
test('text, video draft and fixed result dimensions can each be adjusted without changing their contents or task identity',async({page,networkCounter})=>{
 await page.getByLabel('选择 参考一',{exact:true}).uncheck();const before=await stored(page);
 for(const [id,title,width,height] of [['text-1','镜头文字',320,380],['video-1','视频草稿',360,600],['result-1','固定结果',320,200]] as const){
  await page.getByLabel('选择 '+title,{exact:true}).check();await page.getByRole('button',{name:'定位 '+title,exact:true}).click();
  await page.getByTestId('node-'+id).getByRole('button',{name:'调整节点宽度 '+title,exact:true}).press('ArrowRight');
  await expect.poll(async()=>(await stored(page)).graph.nodes.find((n:{id:string})=>n.id===id).size).toEqual({width:width+10,height});
  expect((await stored(page)).graph.nodes.find((n:{id:string})=>n.id===id).data).toEqual(before.graph.nodes.find((n:{id:string})=>n.id===id).data);
  await page.getByLabel('选择 '+title,{exact:true}).uncheck();
 }
 expect((await stored(page)).runs).toEqual(before.runs);expect(networkCounter.paidRequests).toHaveLength(0);
});
test('losing the writer during a resize cancels the preview and leaves no writable resize control',async({page,networkCounter})=>{
 const before=await stored(page);await drag(page,160,200,false);
 await page.evaluate(async()=>{const leasePath='/src/infrastructure/storage/project-lease.ts',channelPath='/src/infrastructure/storage/tab-channel.ts',m=await import(leasePath),c=await import(channelPath);const acquired=await m.takeoverProjectLease('p1','other-resize-writer',Date.now());if(!acquired.ok)throw Error('takeover_setup_failed');const channel=new c.TabChannel();channel.publish({type:'lease-changed',projectId:'p1',epoch:acquired.epoch,revision:acquired.revision});channel.close();});
 await expect(page.getByTestId('node-asset-1').getByRole('button',{name:/调整节点/})).toHaveCount(0);await page.mouse.up();await expect(page.locator('.canvas-heading [role="status"]')).toContainText('只读');expect(await stored(page)).toEqual(before);expect(networkCounter.paidRequests).toHaveLength(0);
});
