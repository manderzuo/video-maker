import {randomUUID,createHash} from 'node:crypto';
import type {Page} from '@playwright/test';
import type {fixture,Account} from '../../server/tests/account-fixture';
import {test,expect} from '../helpers/cloud-workspace-ui-fixture';
type Workspace=Awaited<ReturnType<typeof fixture>>&{account:Account;providerCalls:unknown[];switchAccount:(account:Account)=>void};
type Reference={projectId:string;projectTitle:string;nodeId?:string;nodeTitle?:string;source:string};
test.afterEach(async({workspace})=>{expect(workspace.providerCalls).toHaveLength(0);});
async function upload(page:Page,workspace:Workspace,title:string,width=2){
 await page.goto('/assets');const png=await page.evaluate(w=>{const c=document.createElement('canvas');c.width=w;c.height=2;return c.toDataURL('image/png').split(',')[1];},width);
 await page.getByLabel('选择素材文件',{exact:true}).setInputFiles({name:title,mimeType:'image/png',buffer:Buffer.from(png,'base64')});await page.getByRole('button',{name:'上传到云端',exact:true}).click();await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();
 const rows=await workspace.pool.query('SELECT id,document FROM workspace_assets WHERE user_id=$1 AND document->>\'title\'=$2',[workspace.account.view.user.id,title]);expect(rows.rows).toHaveLength(1);return rows.rows[0] as {id:string;document:{sha256:string}};
}
async function seed(workspace:Workspace){
 const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6nRAAAAAASUVORK5CYII=','base64'),h=workspace.headers(workspace.account);
 const reserve=await workspace.call('POST','/studio-api/assets',{...h,payload:{title:'审计引用素材',mimeType:'image/png',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}});expect(reserve.statusCode).toBe(201);const asset=reserve.json<{id:string}>();
 const put=await workspace.app.inject({method:'PUT',url:'/studio-api/assets/'+asset.id+'/content',payload:bytes,headers:{cookie:h.cookie,'x-workspace-context':h.context,'x-csrf-token':h.csrf,origin:'https://studio.test','content-type':'application/octet-stream'}});expect(put.statusCode).toBe(204);expect((await workspace.call('POST','/studio-api/assets/'+asset.id+'/complete',{...h,payload:{}})).statusCode).toBe(200);
 const p=await workspace.call('POST','/studio-api/projects',{...h,payload:{title:'审计多节点项目'}});expect(p.statusCode).toBe(201);return {assetId:asset.id,projectId:p.json<{id:string}>().id,headers:h};
}
async function add(workspace:Workspace,projectId:string,assetId:string,nodes:{id:string;title:string}[]){
 const response=await workspace.call('POST','/studio-api/projects/'+projectId+'/commands',{...workspace.headers(workspace.account),payload:{expectedRevision:0,idempotencyKey:randomUUID(),command:{type:'operations',operations:nodes.map((n,i)=>({id:randomUUID(),type:'add_node',payload:{node:{...n,type:'asset',x:40+i*400,y:40,locked:false,data:{kind:'asset',assetId}}}}))}}});expect(response.statusCode).toBe(200);
}
test('audit asset references authorize the owning account and do not change storage',async({workspace},testInfo)=>{
 const s=await seed(workspace),node={id:randomUUID(),title:'甲账号节点'};await add(workspace,s.projectId,s.assetId,[node]);const other=await workspace.signup('Asset_Reference_B');
 const before=await workspace.pool.query('SELECT document FROM workspace_assets WHERE id=$1',[s.assetId]);const anonymous=await workspace.call('GET','/studio-api/assets/'+s.assetId+'/references');const foreign=await workspace.call('GET','/studio-api/assets/'+s.assetId+'/references',workspace.headers(other));const own=await workspace.call('GET','/studio-api/assets/'+s.assetId+'/references',s.headers);
 expect(anonymous.statusCode).toBe(401);expect(foreign.statusCode).toBe(404);expect(own.statusCode).toBe(200);expect(own.json<Reference[]>().some(r=>r.projectId===s.projectId&&r.nodeId===node.id)).toBe(true);expect((await workspace.pool.query('SELECT document FROM workspace_assets WHERE id=$1',[s.assetId])).rows).toEqual(before.rows);
 await testInfo.attach('owned-reference-security',{contentType:'application/json',body:JSON.stringify({anonymous:anonymous.statusCode,foreign:foreign.statusCode,own:own.statusCode,references:own.json(),storedAssetUnchanged:true})});
});
test('audit references list all current nodes and keep history distinct',async({workspace},testInfo)=>{
 const s=await seed(workspace),nodes=[{id:randomUUID(),title:'当前节点甲'},{id:randomUUID(),title:'当前节点乙'}];await add(workspace,s.projectId,s.assetId,nodes);
 const response=await workspace.call('GET','/studio-api/assets/'+s.assetId+'/references',s.headers);expect(response.statusCode).toBe(200);const refs=response.json<Reference[]>();
 await testInfo.attach('actual-two-node-references',{contentType:'application/json',body:JSON.stringify({expectedCurrentNodes:nodes,actual:refs})});
 expect.soft(refs.filter(r=>r.source==='graph').map(r=>r.nodeId).sort()).toEqual(nodes.map(n=>n.id).sort());expect.soft(refs.filter(r=>r.source.startsWith('command:')).every(r=>!r.nodeId)).toBe(true);
});
test('audit asset detail link focuses the referenced node',async({page,workspace},testInfo)=>{
 const s=await seed(workspace),node={id:randomUUID(),title:'需要定位的节点'};await add(workspace,s.projectId,s.assetId,[node]);await page.goto('/assets');await page.getByRole('button',{name:'查看详情',exact:true}).click();const dialog=page.getByRole('dialog',{name:'素材详情',exact:true});await expect(dialog).toContainText(node.title);await dialog.locator('p',{hasText:node.title}).getByRole('link',{name:'定位项目画布',exact:true}).click();await expect(page).toHaveURL(new RegExp('/projects/'+s.projectId+'/canvas'));
 await testInfo.attach('actual-focus-destination',{contentType:'application/json',body:JSON.stringify({actualUrl:page.url(),expectedNodeId:node.id})});expect(new URL(page.url()).searchParams.get('node')).toBe(node.id);
});
test('audit latest selected asset survives a late earlier detail response',async({page,workspace},testInfo)=>{
 const a=await upload(page,workspace,'先选素材甲.png',2);await upload(page,workspace,'后选素材乙.png',3);let release!:()=>void,observed!:()=>void;const gate=new Promise<void>(r=>release=r),started=new Promise<void>(r=>observed=r),pattern='**/studio-api/assets/'+a.id+'/references';let delayed:Promise<void>|undefined;
 await page.route(pattern,async route=>{delayed=(async()=>{const response=await workspace.call('GET','/studio-api/assets/'+a.id+'/references',workspace.headers(workspace.account));expect(response.statusCode).toBe(200);observed();await gate;await route.fulfill({status:response.statusCode,contentType:'application/json',body:response.payload});})();await delayed;});
 try{await page.locator('article',{has:page.getByRole('heading',{name:'先选素材甲.png',exact:true})}).getByRole('button',{name:'查看详情',exact:true}).click();await started;await page.locator('article',{has:page.getByRole('heading',{name:'后选素材乙.png',exact:true})}).getByRole('button',{name:'查看详情',exact:true}).click();const dialog=page.getByRole('dialog',{name:'素材详情',exact:true});await expect(dialog).toContainText('后选素材乙.png');const returned=page.waitForResponse(r=>r.url().endsWith('/assets/'+a.id+'/references'));release();await (await returned).finished();await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));await expect(dialog).toBeVisible();await testInfo.attach('late-detail-current-dialog',{contentType:'application/json',body:JSON.stringify({afterEarlierResponse:await dialog.textContent(),expected:'后选素材乙.png'})});await expect(dialog).toContainText('后选素材乙.png');}
 finally{release();await delayed;await page.unroute(pattern);}
});
test('audit a late old account asset detail cannot enter the new account',async({page,workspace})=>{
 const a=await upload(page,workspace,'甲账号私有详情.png');let release!:()=>void,observed!:()=>void;const gate=new Promise<void>(r=>release=r),started=new Promise<void>(r=>observed=r),pattern='**/studio-api/assets/'+a.id+'/references';let delayed:Promise<void>|undefined;
 await page.route(pattern,async route=>{delayed=(async()=>{const response=await workspace.call('GET','/studio-api/assets/'+a.id+'/references',workspace.headers(workspace.account));expect(response.statusCode).toBe(200);observed();await gate;await route.fulfill({status:response.statusCode,contentType:'application/json',body:response.payload}).catch(()=>{});})();await delayed;});
 try{await page.getByRole('button',{name:'查看详情',exact:true}).click();await started;const b=await workspace.signup('Asset_Detail_B');workspace.switchAccount(b);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.getByText('当前账号：Asset_Detail_B',{exact:true})).toBeVisible();release();await delayed;await expect(page.getByRole('dialog',{name:'素材详情',exact:true})).toHaveCount(0);await expect(page.getByText('甲账号私有详情.png',{exact:true})).toHaveCount(0);}
 finally{release();await delayed;await page.unroute(pattern);}
});
test('asset details show cloud identity import source unknown properties and reference count',async({page,workspace})=>{
 const s=await seed(workspace);await page.goto('/assets');await page.getByRole('button',{name:'查看详情',exact:true}).click();const dialog=page.getByRole('dialog',{name:'素材详情',exact:true});
 await expect(dialog).toHaveAttribute('data-dialog-id','D07');
 await expect(dialog.getByText('素材 ID',{exact:true})).toBeVisible();await expect(dialog.getByText(s.assetId,{exact:true})).toBeVisible();await expect(dialog).toContainText('用户上传');await expect(dialog).toContainText('未知 / 未知 秒 / 68 字节');await expect(dialog).toContainText('当前账号云端 · '+s.assetId);await expect(dialog).toContainText('引用数量（含历史）0');
});
