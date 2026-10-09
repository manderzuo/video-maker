import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {test,expect} from '../helpers/cloud-workspace-ui-fixture';
// F030 提示词库 JSON 导入/导出、F031 应用到现有文字节点、F032 画布节点两入口。
type Ctx={headers(account:unknown):Record<string,string>;call(method:string,path:string,options?:unknown):Promise<{json:()=>unknown;statusCode:number}>;pool:{query(text:string,values?:unknown[]):Promise<{rows:{n?:number}[]}>};account:{view:{user:{id:string}}}};
const asCtx=(value:unknown)=>value as Ctx;
const transferFile=(entries:unknown[])=>Buffer.from(JSON.stringify({version:1,entries}));
const sampleEntry=(patch:Record<string,unknown>={})=>({title:'导入条目',body:'导入正文',tags:['旧库'],variables:['name'],source:'旧库',license:'CC0',...patch});
async function seedTextProject(value:unknown,text:string,title='库流转'){
 const ctx=asCtx(value),headers=ctx.headers(ctx.account);
 const project=(await ctx.call('POST','/studio-api/projects',{...headers,payload:{title}})).json() as {id:string};
 const textId=randomUUID();
 expect((await ctx.call('POST','/studio-api/projects/'+project.id+'/commands',{...headers,payload:{expectedRevision:0,idempotencyKey:randomUUID(),command:{type:'operations',operations:[{id:randomUUID(),type:'add_node',payload:{node:{id:textId,type:'text',title:'流转节点',x:40,y:40,locked:false,data:{kind:'text',text,referenceTokens:[]}}}}]}}})).statusCode).toBe(200);
 return {project,textId,headers};
}
test('imports chosen prompt entries and replays the same batch without duplicates',async({page,workspace})=>{
 const ctx=asCtx(workspace),headers=workspace.headers(workspace.account);
 await page.goto('/prompts');
 await page.locator('[data-interaction-id="cloud:prompt:import"]').setInputFiles({name:'prompts.json',mimeType:'application/json',buffer:transferFile([sampleEntry()])});
 await page.getByRole('button',{name:'校验并预览',exact:true}).click();
 await expect(page.getByRole('heading',{name:'导入条目',exact:true})).toBeVisible();
 let once=false;
 await page.route('**/studio-api/prompts',async route=>{
  if(route.request().method()!=='POST'){await route.fallback();return;}
  if(!once){once=true;await ctx.call('POST','/studio-api/prompts',{...headers,payload:route.request().postDataJSON()});await route.fulfill({status:500,body:'{}'});return;}
  await route.fallback();
 });
 await page.getByRole('button',{name:'确认导入当前账号',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'导入提示词JSON',exact:true}).getByRole('alert')).toContainText('导入未完成');
 await page.getByRole('button',{name:'确认导入当前账号',exact:true}).click();
 await expect(page.getByText('已导入1条提示词',{exact:false})).toBeVisible();
 const rows=(await ctx.pool.query("SELECT document FROM workspace_content WHERE kind='prompt'")).rows as unknown as {document:{title:string;body:string;source:string;license:string}}[];
 expect(rows.filter(row=>row.document.title==='导入条目')).toHaveLength(1);
 expect(rows[0].document).toMatchObject({body:'导入正文',source:'旧库',license:'CC0'});
 expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(0);
});
test('rejects broken and oversized prompt files and writes nothing on cancel',async({page,workspace})=>{
 const ctx=asCtx(workspace);
 const dialog=()=>page.getByRole('dialog',{name:'导入提示词JSON',exact:true});
 await page.goto('/prompts');
 await page.locator('[data-interaction-id="cloud:prompt:import"]').setInputFiles({name:'broken.json',mimeType:'application/json',buffer:Buffer.from('{broken')});
 await page.getByRole('button',{name:'校验并预览',exact:true}).click();
 await expect(dialog().getByRole('alert')).toBeVisible();
 await dialog().getByRole('button',{name:'取消',exact:true}).click();
 await page.locator('[data-interaction-id="cloud:prompt:import"]').setInputFiles({name:'big.json',mimeType:'application/json',buffer:Buffer.alloc(17*1024*1024)});
 await page.getByRole('button',{name:'校验并预览',exact:true}).click();
 await expect(dialog().getByRole('alert')).toBeVisible();
 await dialog().getByRole('button',{name:'取消',exact:true}).click();
 await page.locator('[data-interaction-id="cloud:prompt:import"]').setInputFiles({name:'prompts.json',mimeType:'application/json',buffer:transferFile([sampleEntry({title:'取消条目'})])});
 await page.getByRole('button',{name:'校验并预览',exact:true}).click();
 await expect(page.getByRole('heading',{name:'取消条目',exact:true})).toBeVisible();
 await dialog().getByRole('button',{name:'取消',exact:true}).click();
 expect((await ctx.pool.query("SELECT id FROM workspace_content WHERE kind='prompt'")).rows).toHaveLength(0);
 expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(0);
});
test('exports selected entries with full fields and keeps them isolated per account',async({page,workspace},testInfo)=>{
 const ctx=asCtx(workspace),headers=workspace.headers(workspace.account);
 for(const title of ['导出甲','导出乙'])expect((await ctx.call('POST','/studio-api/prompts',{...headers,payload:{title,body:title+'正文',tags:['库'],variables:[],source:'库内',license:'CC0',starred:false,idempotencyKey:randomUUID()}})).statusCode).toBe(201);
 await page.goto('/prompts');
 await page.locator('article',{has:page.getByRole('heading',{name:'导出甲',exact:true})}).locator('[data-interaction-id="cloud:prompt:select"]').check();
 const downloading=page.waitForEvent('download');
 await page.getByRole('button',{name:'导出所选提示词',exact:true}).click();
 const path=testInfo.outputPath('prompts-export.json');
 await (await downloading).saveAs(path);
 expect(JSON.parse(readFileSync(path,'utf8'))).toEqual({version:1,entries:[{title:'导出甲',body:'导出甲正文',tags:['库'],variables:[],source:'库内',license:'CC0'}]});
 await page.locator('article',{has:page.getByRole('heading',{name:'导出甲',exact:true})}).locator('[data-interaction-id="cloud:prompt:select"]').uncheck();
 await expect(page.getByRole('button',{name:'导出所选提示词',exact:true})).toBeDisabled();
 const b=await workspace.signup('Cloud_UI_B');workspace.switchAccount(b);
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(page.getByRole('heading',{name:'导出甲',exact:true})).toHaveCount(0);
 expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(0);
});
test('applies a library template onto an existing text node with preview and frozen retry',async({page,workspace})=>{
 const ctx=asCtx(workspace);
 const seed=await seedTextProject(workspace,'旧正文','替换目标'),project=seed.project,textId=seed.textId,headers=seed.headers;
 expect((await ctx.call('POST','/studio-api/prompts',{...headers,payload:{title:'替换模板',body:'新正文',tags:[],variables:[],source:'库内',license:'CC0',starred:false,idempotencyKey:randomUUID()}})).statusCode).toBe(201);
 await page.goto('/prompts');
 await page.locator('article',{has:page.getByRole('heading',{name:'替换模板',exact:true})}).getByRole('button',{name:'填写变量并插入画布',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'填写提示词变量',exact:true});
 await expect(dialog.locator('[data-interaction-id="cloud:prompt:replace-node"] option')).toHaveCount(2);
 await dialog.getByLabel('目标文字节点',{exact:true}).selectOption(textId);
 await expect(dialog.getByText('原正文：旧正文',{exact:false})).toBeVisible();
 await expect(dialog.getByText('新正文：新正文',{exact:false})).toBeVisible();
 const bodies:string[]=[];
 await page.route('**/studio-api/projects/*/commands',async route=>{
  bodies.push(JSON.stringify(route.request().postDataJSON()));
  if(bodies.length===1){await ctx.call('POST','/studio-api/projects/'+project.id+'/commands',{...headers,payload:route.request().postDataJSON()});await route.fulfill({status:500,body:'{}'});return;}
  await route.fallback();
 });
 await dialog.getByRole('button',{name:'替换选中文字节点',exact:true}).click();
 await expect(dialog.getByRole('alert')).toBeVisible();
 await expect(dialog.getByLabel('目标文字节点',{exact:true})).toHaveValue(textId);
 await expect(dialog.getByText('有未完成的提交',{exact:false})).toBeVisible();
 await expect(dialog.getByRole('button',{name:'重新读取目标项目',exact:true})).toHaveCount(0);
 await expect(dialog.getByLabel('目标文字节点',{exact:true})).toBeDisabled();
 await dialog.getByRole('button',{name:'替换选中文字节点',exact:true}).click();
 await expect(page.getByText('已替换目标文字节点',{exact:false})).toBeVisible();
 expect(bodies).toHaveLength(2);expect(bodies[0]).toBe(bodies[1]);
 expect((await ctx.pool.query('SELECT id FROM workspace_command_receipts')).rows).toHaveLength(2);
 const graphs=(await ctx.pool.query('SELECT graph FROM workspace_graphs')).rows as unknown as {graph:{nodes:{id:string;type:string;data:{text:string;promptLibrarySource:{entryId:string;source:string}}}[]}}[];
 const node=graphs[0].graph.nodes.find(item=>item.id===textId);
 expect(node?.data.text).toBe('新正文');
 expect(node?.data.promptLibrarySource).toMatchObject({source:'库内'});
 const entry=(await ctx.pool.query("SELECT document FROM workspace_content WHERE kind='prompt'")).rows as unknown as {document:{body:string}}[];
 expect(entry).toHaveLength(1);expect(entry[0].document.body).toBe('新正文');
 expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(0);
});
test('saves a canvas text node into the prompt library with full text',async({page,workspace})=>{
 const ctx=asCtx(workspace);
 await seedTextProject(workspace,'节点全文内容','节点入库');
 const projectId=((await ctx.pool.query('SELECT id FROM workspace_projects')).rows[0] as unknown as {id:string}).id;
 await page.goto('/projects/'+projectId+'/canvas');
 await page.getByRole('button',{name:'保存为提示词',exact:true}).click();
 await expect(page).toHaveURL(/\/prompts\?seed=1/);
 await expect(page.getByLabel('提示词正文',{exact:true})).toHaveValue('节点全文内容');
 await expect(page.getByLabel('提示词名称',{exact:true})).toHaveValue('流转节点');
 await page.route('**/studio-api/prompts',async route=>{
  if(route.request().method()!=='POST'){await route.fallback();return;}
  await route.fulfill({status:500,body:'{}'});
 });
 await page.getByRole('button',{name:'保存提示词',exact:true}).click();
 await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
 await expect(page.getByLabel('提示词正文',{exact:true})).toHaveValue('节点全文内容');
 await page.unroute('**/studio-api/prompts');
 await page.getByRole('button',{name:'保存提示词',exact:true}).click();
 await expect(page.getByRole('heading',{name:'流转节点',exact:true})).toBeVisible();
 const rows=(await ctx.pool.query("SELECT document FROM workspace_content WHERE kind='prompt'")).rows as unknown as {document:{title:string;body:string;source:string}}[];
 expect(rows).toHaveLength(1);
 expect(rows[0].document.source).toContain('画布项目');
 expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(0);
});
test('opens a canvas text node in cloud writing with saved revision bound',async({page,workspace})=>{ const ctx=asCtx(workspace);
 const seed=await seedTextProject(workspace,'写作源正文','节点写作'),project=seed.project,textId=seed.textId;
 await page.goto('/projects/'+project.id+'/canvas');
 await page.locator('[data-interaction-id="cloud:canvas:node-text"]').first().fill('写作源正文已修改');
 await page.getByRole('button',{name:'在写作中打开',exact:true}).click();
 await expect(page).toHaveURL(/\/prompt-generator\?draft=/);
 const id=new URL(page.url()).searchParams.get('draft')!;
 await expect(page.locator('[data-interaction-id="cloud:draft:select"]')).toHaveValue(id);
 const drafts=(await ctx.pool.query("SELECT document FROM workspace_content WHERE kind='draft' AND id=$1",[id])).rows as unknown as {document:{userRequest:string;sourceProjectId:string;sourceNodeId:string;sourceRevision:number}}[];
 expect(drafts).toHaveLength(1);
 expect(drafts[0].document).toMatchObject({userRequest:'写作源正文已修改',sourceProjectId:project.id,sourceNodeId:textId});
 expect(drafts[0].document.sourceRevision).toBeGreaterThanOrEqual(1);
 expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(0);
});
test('keeps input and stays when opening writing fails',async({page,workspace})=>{
 const seed=await seedTextProject(workspace,'写作源正文','写作失败'),project=seed.project;
 await page.goto('/projects/'+project.id+'/canvas');
 page.on('console',message=>{if(message.text().startsWith('WRITING_RETRY'))console.log(message.text());});
 await page.route('**/studio-api/prompt-drafts',async route=>{
  if(route.request().method()!=='POST'){await route.fallback();return;}
  await route.fulfill({status:500,body:'{}'});
 });
 await page.getByRole('button',{name:'在写作中打开',exact:true}).click();
 await expect(page.getByRole('alert')).toBeVisible();
 await expect(page).toHaveURL(/\/projects\/.+\/canvas$/);
 await expect(page.locator('[data-interaction-id="cloud:canvas:node-text"]').first()).toHaveValue('写作源正文');
 expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(0);
});
test('refuses a prompt seed from another account and clears it',async({page,workspace})=>{
 const aId=workspace.account.view.user.id;
 const b=await workspace.signup('Cloud_UI_B');workspace.switchAccount(b);
 await page.goto('/projects');
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(page.getByText('当前账号：Cloud_UI_B',{exact:true})).toBeVisible();
 await page.evaluate(a=>sessionStorage.setItem('aiwork:prompt-seed',JSON.stringify({userId:a,title:'A私密',body:'A账号未保存私密全文',source:'画布项目 x'})),aId);
 await page.goto('/prompts?seed=1');
 await expect(page.getByRole('heading',{name:'提示词库',exact:true})).toBeVisible();
 await expect(page.getByLabel('提示词正文',{exact:true})).toHaveCount(0);
 expect(await page.evaluate(()=>sessionStorage.getItem('aiwork:prompt-seed'))).toBeNull();
 const rows=(await asCtx(workspace).pool.query("SELECT document FROM workspace_content WHERE kind='prompt'")).rows;
 expect(rows).toHaveLength(0);
 expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(0);
});
test('creates only one writing draft on unknown response and double click',async({page,workspace})=>{
 const ctx=asCtx(workspace);
 const seed=await seedTextProject(workspace,'连点正文','连点写作'),project=seed.project,textId=seed.textId,headers=seed.headers;
 await page.goto('/projects/'+project.id+'/canvas');
 let posts=0;
 const bodies:string[]=[];
 await page.route('**/studio-api/prompt-drafts',async route=>{
  if(route.request().method()!=='POST'){await route.fallback();return;}
  posts++;
  bodies.push(JSON.stringify(route.request().postDataJSON()));
  if(posts===1){await ctx.call('POST','/studio-api/prompt-drafts',{...headers,payload:route.request().postDataJSON()});await route.fulfill({status:500,body:'{}'});return;}
  await route.fallback();
 });
 await page.getByRole('button',{name:'在写作中打开',exact:true}).click();
 await expect(page.getByRole('alert')).toBeVisible();
 await page.getByRole('button',{name:'在写作中打开',exact:true}).click();
 await expect(page).toHaveURL(/\/prompt-generator\?draft=/);
 expect(posts).toBe(2);
 expect(bodies[0]).toBe(bodies[1]);
 const once=(await ctx.pool.query("SELECT document FROM workspace_content WHERE kind='draft'")).rows as unknown as {document:{sourceNodeId:string}}[];
 expect(once.filter(row=>row.document.sourceNodeId===textId)).toHaveLength(1);
 await page.unroute('**/studio-api/prompt-drafts');
 await page.route('**/studio-api/prompt-drafts',async route=>{
  if(route.request().method()!=='POST'){await route.fallback();return;}
  await new Promise(resolve=>setTimeout(resolve,500));
  await route.fallback();
 });
 await page.goto('/projects/'+project.id+'/canvas');
 await page.getByRole('button',{name:'在写作中打开',exact:true}).click();
 await page.waitForTimeout(100);
 await page.getByRole('button',{name:'在写作中打开',exact:true}).click();
 await expect(page).toHaveURL(/\/prompt-generator\?draft=/);
 const twice=(await ctx.pool.query("SELECT document FROM workspace_content WHERE kind='draft'")).rows as unknown as {document:{sourceNodeId:string}}[];
 expect(twice.filter(row=>row.document.sourceNodeId===textId)).toHaveLength(2);
 expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(0);
});
test('resumes a pending writing open after refresh with the same identity',async({page,workspace})=>{
 const ctx=asCtx(workspace);
 const seed=await seedTextProject(workspace,'刷新正文','刷新写作'),project=seed.project,textId=seed.textId,headers=seed.headers;
 await page.goto('/projects/'+project.id+'/canvas');
 let posts=0;
 await page.route('**/studio-api/prompt-drafts',async route=>{
  if(route.request().method()!=='POST'){await route.fallback();return;}
  posts++;
  if(posts===1){await ctx.call('POST','/studio-api/prompt-drafts',{...headers,payload:route.request().postDataJSON()});await route.fulfill({status:500,body:'{}'});return;}
  await route.fallback();
 });
 await page.getByRole('button',{name:'在写作中打开',exact:true}).click();
 await expect(page.getByRole('alert')).toBeVisible();
 await page.reload();
 await expect(page.locator('[data-interaction-id="cloud:canvas:node-text"]').first()).toHaveValue('刷新正文');
 await expect(page.getByRole('button',{name:'放弃本次写作打开',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'在写作中打开',exact:true}).click();
 await expect(page).toHaveURL(/\/prompt-generator\?draft=/);
 const drafts=(await ctx.pool.query("SELECT document FROM workspace_content WHERE kind='draft'")).rows as unknown as {document:{sourceNodeId:string}}[];
 expect(drafts.filter(row=>row.document.sourceNodeId===textId)).toHaveLength(1);
 expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(0);
});
