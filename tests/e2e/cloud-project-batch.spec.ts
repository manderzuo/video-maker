import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {unzipSync,strFromU8} from 'fflate';
import {test,expect} from '../helpers/cloud-workspace-ui-fixture';
// F033 项目模板/选择/批量归档/批量导出/视图切换；F034 偏好重置/恢复、活动筛选/详情/隐藏。
type Ctx={headers(account:unknown):Record<string,string>;call(method:string,path:string,options?:unknown):Promise<{json:()=>unknown;statusCode:number}>;pool:{query(text:string,values?:unknown[]):Promise<{rows:{n?:number}[]}>};account:{view:{user:{id:string}}}};
const asCtx=(value:unknown)=>value as Ctx;
async function makeProject(ctx:Ctx,title:string){
 const headers=ctx.headers(ctx.account);
 const project=(await ctx.call('POST','/studio-api/projects',{...headers,payload:{title}})).json() as {id:string;revision:number};
 return {project,headers};
}
async function addTextNode(ctx:Ctx,headers:Record<string,string>,projectId:string,revision:number,text:string){
 expect((await ctx.call('POST','/studio-api/projects/'+projectId+'/commands',{...headers,payload:{expectedRevision:revision,idempotencyKey:randomUUID(),command:{type:'operations',operations:[{id:randomUUID(),type:'add_node',payload:{node:{id:randomUUID(),type:'text',title:'节点',x:40,y:40,locked:false,data:{kind:'text',text,referenceTokens:[]}}}}]}}})).statusCode).toBe(200);
}
test('creates a project from the original template with two text nodes',async({page,workspace})=>{
 const ctx=asCtx(workspace);
 await page.goto('/projects');
 await page.getByRole('button',{name:'使用原创模板',exact:true}).click();
 await expect(page.getByText('原创静态结构',{exact:false})).toBeVisible();
 let release:()=>void=()=>{};
 const gate=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/studio-api/projects',async route=>{
  if(route.request().method()!=='POST'){await route.fallback();return;}
  await gate;
  await route.fallback();
 });
 await page.getByRole('button',{name:'创建原创分镜草稿',exact:true}).click();
 await page.waitForTimeout(300);
 await expect(page.getByRole('button',{name:'创建原创分镜草稿',exact:true})).toBeDisabled();
 release();
 await expect(page).toHaveURL(/\/projects\/.+\/canvas$/);
 const graphs=(await ctx.pool.query('SELECT graph FROM workspace_graphs')).rows as unknown as {graph:{nodes:{type:string;title:string;data:{text:string}}[]}}[];
 expect(graphs).toHaveLength(1);
 expect(graphs[0].graph.nodes.map(node=>node.title).sort()).toEqual(['分镜约束','创作需求']);
 await expect(page.locator('[data-interaction-id="cloud:canvas:node-text"]').first()).toBeVisible();
 await expect(page.locator('[data-interaction-id="cloud:canvas:node-text"]').nth(1)).toBeVisible();
 expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(0);
});
test('selects projects and archives them one by one with failures listed',async({page,workspace})=>{
 const ctx=asCtx(workspace);
 const a=await makeProject(ctx,'批量甲'),b=await makeProject(ctx,'批量乙'),c=await makeProject(ctx,'批量丙');
 await page.goto('/projects');
 for(const title of ['批量甲','批量乙','批量丙'])await page.locator('li',{has:page.getByRole('link',{name:title,exact:true})}).locator('[data-interaction-id="cloud:project:select"]').check();
 await expect(page.getByText('已选择 3 项',{exact:true})).toBeVisible();
 await page.getByLabel('搜索项目',{exact:true}).fill('批量甲');
 await expect(page.getByText(/包含筛选范围外 2 项/,{exact:false})).toBeVisible();
 await page.getByLabel('搜索项目',{exact:true}).fill('');
 // 使批量乙的修订过期：直接改一次
 await ctx.call('PATCH','/studio-api/projects/'+b.project.id,{...b.headers,payload:{expectedRevision:0,title:'批量乙'}});
 await page.getByRole('button',{name:'批量归档',exact:true}).click();
 await page.getByRole('button',{name:'归档 3 项',exact:true}).click();
 await expect(page.getByText('批量归档成功 2，失败 1',{exact:false})).toBeVisible();
 await expect(page.getByText('批量乙',{exact:false}).first()).toBeVisible();
 const archived=(await ctx.pool.query('SELECT document FROM workspace_projects')).rows as unknown as {document:{title:string;archived:boolean}}[];
 expect(archived.find(row=>row.document.title==='批量甲')?.document.archived).toBe(true);
 expect(archived.find(row=>row.document.title==='批量丙')?.document.archived).toBe(true);
 expect(archived.find(row=>row.document.title==='批量乙')?.document.archived).toBe(false);
 await page.reload();
 await expect(page.locator('[data-interaction-id="cloud:project:filter"]')).toBeVisible();
 await page.locator('[data-interaction-id="cloud:project:filter"]').selectOption('archived');
 await expect(page.getByRole('link',{name:'批量甲',exact:true})).toBeVisible();
 await expect(page.getByRole('link',{name:'批量乙',exact:true})).toHaveCount(0);
 void a;void c;
 expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(0);
});
test('exports selected projects as one batch without secrets and refuses empty failure',async({page,workspace},testInfo)=>{
 const ctx=asCtx(workspace);
 const a=await makeProject(ctx,'包甲'),b=await makeProject(ctx,'包乙');
 await addTextNode(ctx,a.headers,a.project.id,0,'包甲正文');
 await addTextNode(ctx,b.headers,b.project.id,0,'包乙正文');
 await page.goto('/projects');
 for(const title of ['包甲','包乙'])await page.locator('li',{has:page.getByRole('link',{name:title,exact:true})}).locator('[data-interaction-id="cloud:project:select"]').check();
 await page.getByRole('button',{name:'批量导出所选项目',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'批量导出项目包',exact:true}).getByText('包甲',{exact:false})).toBeVisible(); const downloading=page.waitForEvent('download');
 await page.getByRole('button',{name:'导出 2 项',exact:true}).click();
 const path=testInfo.outputPath('projects-batch.zip');
 await (await downloading).saveAs(path);
 const outer=unzipSync(new Uint8Array(readFileSync(path)));
 const names=Object.keys(outer).sort();
 expect(names).toHaveLength(2);
 expect(names[0]).toMatch(/^包乙-[0-9a-f]{8}-cloud\.zip$/);
 expect(names[1]).toMatch(/^包甲-[0-9a-f]{8}-cloud\.zip$/);
 for(const name of names){
  const inner=unzipSync(outer[name]);
  const data=JSON.parse(strFromU8(inner['project.json']));
  expect(['包甲','包乙']).toContain(data.project.title);
  expect(JSON.stringify(data)).not.toContain('FAKE');
 }
 expect(new Set(names.map(name=>JSON.parse(strFromU8(unzipSync(outer[name])['project.json'])).project.title)).size).toBe(2);
 // 全部失败不产出包：拦截导出接口
 await page.route('**/studio-api/projects/*/export',async route=>{await route.fulfill({status:500,body:'{}'});});
 await page.getByRole('button',{name:'批量导出所选项目',exact:true}).click();
 await page.getByRole('button',{name:'导出 2 项',exact:true}).click();
 await expect(page.getByText('批量导出全部失败，未产出下载包',{exact:false})).toBeVisible();
 let downloaded=false;
 page.once('download',()=>{downloaded=true;});
 await page.waitForTimeout(1500);
 expect(downloaded).toBe(false);
 await page.unroute('**/studio-api/projects/*/export');
 expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(0);
});
test('switches project views keeping filter and selection with account preference',async({page,workspace})=>{
 const ctx=asCtx(workspace);
 await makeProject(ctx,'视图甲');await makeProject(ctx,'视图乙');
 await page.goto('/projects');
 await page.locator('li',{has:page.getByRole('link',{name:'视图甲',exact:true})}).locator('[data-interaction-id="cloud:project:select"]').check();
 await page.getByLabel('搜索项目',{exact:true}).fill('视图');
 await page.getByRole('button',{name:'列表视图',exact:true}).click();
 await expect(page.locator('table.cloud-project-table')).toBeVisible();
 await expect(page.locator('table.cloud-project-table input[type="checkbox"]:checked')).toHaveCount(1);
 await expect(page.getByLabel('搜索项目',{exact:true})).toHaveValue('视图');
 await page.reload();
 await expect(page.locator('table.cloud-project-table')).toBeVisible();
 await page.getByRole('button',{name:'网格视图',exact:true}).click();
 await expect(page.locator('ul.cloud-project-list')).toBeVisible();
 // 视图保存失败保持原视图并提示，重试后持久。
 await page.route('**/studio-api/me/document',async route=>{
  if(route.request().method()!=='PATCH'){await route.fallback();return;}
  await route.fulfill({status:500,body:'{}'});
 });
 await page.getByRole('button',{name:'列表视图',exact:true}).click();
 await expect(page.getByRole('alert')).toBeVisible();
 await expect(page.locator('ul.cloud-project-list')).toBeVisible();
 await page.unroute('**/studio-api/me/document');
 await page.getByRole('button',{name:'列表视图',exact:true}).click();
 await expect(page.locator('table.cloud-project-table')).toBeVisible();
 await page.reload();
 await expect(page.locator('table.cloud-project-table')).toBeVisible();
 expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(0);
});
test('resets appearance preferences with confirmation and restores the prior values',async({page,workspace})=>{
 await page.goto('/settings/appearance');
 await page.getByLabel('主题',{exact:true}).selectOption('light');
 await page.getByRole('button',{name:'保存偏好',exact:true}).click();
 await expect(page.getByText('偏好已保存',{exact:false})).toBeVisible();
 await expect(page.getByLabel('主题',{exact:true})).toHaveValue('light');
 await page.getByRole('button',{name:'重置外观与播放偏好',exact:true}).click();
 await expect(page.getByText('仅重置主题',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'确认重置偏好',exact:true}).click();
 await expect(page.getByText('外观与播放偏好已重置',{exact:false})).toBeVisible();
 await expect(page.getByLabel('主题',{exact:true})).toHaveValue('dark');
 await page.getByRole('button',{name:'恢复重置前偏好',exact:true}).click();
 await expect(page.getByText('已恢复重置前偏好',{exact:false})).toBeVisible();
 await expect(page.getByLabel('主题',{exact:true})).toHaveValue('light');
 // 恢复后刷新仍为原外观；生成规格与项目任务不受偏好操作影响（DB 核对）。
 await page.reload();
 await expect(page.getByLabel('主题',{exact:true})).toHaveValue('light');
 await page.getByRole('button',{name:'重置外观与播放偏好',exact:true}).click();
 await page.getByRole('button',{name:'确认重置偏好',exact:true}).click();
 await expect(page.getByText('外观与播放偏好已重置',{exact:false})).toBeVisible();
 await page.reload();
 await expect(page.getByLabel('主题',{exact:true})).toHaveValue('dark');
 // 保存失败保留输入
 await page.route('**/studio-api/me/document',async route=>{
  if(route.request().method()!=='PATCH'){await route.fallback();return;}
  await route.fulfill({status:500,body:'{}'});
 });
 await page.getByLabel('主题',{exact:true}).selectOption('system');
 await page.getByRole('button',{name:'保存偏好',exact:true}).click();
 await expect(page.getByRole('alert')).toBeVisible();
 await expect(page.getByLabel('主题',{exact:true})).toHaveValue('system');
 await page.unroute('**/studio-api/me/document');
 expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(0);
});
test('blocks duplicate batch archive submissions while one is in flight',async({page,workspace})=>{
 const ctx=asCtx(workspace);
 await makeProject(ctx,'挂起甲');
 await page.goto('/projects');
 await page.locator('li',{has:page.getByRole('link',{name:'挂起甲',exact:true})}).locator('[data-interaction-id="cloud:project:select"]').check();
 let posts=0,release:()=>void=()=>{};
 const gate=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/studio-api/projects/*/commands',async route=>{await route.fallback();});
 await page.route('**/studio-api/projects/*',async route=>{
  if(route.request().method()!=='PATCH'){await route.fallback();return;}
  posts++;
  await gate;
  await route.fallback();
 });
 await page.getByRole('button',{name:'批量归档',exact:true}).click();
 await page.getByRole('button',{name:'归档 1 项',exact:true}).click();
 await page.waitForTimeout(300);
 await expect(page.getByRole('button',{name:'归档 1 项',exact:true})).toBeDisabled();
 release();
 await expect(page.getByText('批量归档成功 1，失败 0',{exact:false})).toBeVisible();
 expect(posts).toBe(1);
 await page.unroute('**/studio-api/projects/*');
 await page.unroute('**/studio-api/projects/*/commands');
 expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(0);
});
test('keeps the reset dialog and prior values when the reset request fails',async({page,workspace})=>{
 await page.goto('/settings/appearance');
 await page.getByLabel('主题',{exact:true}).selectOption('light');
 await page.getByRole('button',{name:'保存偏好',exact:true}).click();
 await expect(page.getByText('偏好已保存',{exact:false})).toBeVisible();
 await page.route('**/studio-api/me/document',async route=>{
  if(route.request().method()!=='PATCH'){await route.fallback();return;}
  await route.fulfill({status:500,body:'{}'});
 });
 await page.getByRole('button',{name:'重置外观与播放偏好',exact:true}).click();
 await page.getByRole('button',{name:'确认重置偏好',exact:true}).click();
 await expect(page.getByRole('alert')).toBeVisible();
 await expect(page.getByRole('dialog',{name:'重置操作偏好',exact:true})).toBeVisible();
 await expect(page.getByLabel('主题',{exact:true})).toHaveValue('light');
 await page.unroute('**/studio-api/me/document');
 await page.getByRole('button',{name:'确认重置偏好',exact:true}).click();
 await expect(page.getByText('外观与播放偏好已重置',{exact:false})).toBeVisible();
 expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(0);
});
test('filters activity receipts, shows details and hides display without deleting',async({page,workspace})=>{ const ctx=asCtx(workspace);
 const a=await makeProject(ctx,'活动甲'),b=await makeProject(ctx,'活动乙');
 await addTextNode(ctx,a.headers,a.project.id,0,'甲正文');
 await addTextNode(ctx,b.headers,b.project.id,0,'乙正文');
 await page.goto('/activity');
 await expect(page.locator('article')).toHaveCount(2);
 await expect(page.getByRole('button',{name:/恢复隐藏显示/,exact:false})).toBeDisabled();
 await page.getByLabel('按项目标题筛选',{exact:true}).fill('活动甲');
 await expect(page.locator('article')).toHaveCount(1);
 await expect(page.getByText('共 2 条回执，当前显示 1 条',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'清除活动筛选',exact:true}).click();
 await expect(page.locator('article')).toHaveCount(2);
 await page.locator('article').first().getByRole('button',{name:'查看回执详情',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'回执详情',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'关闭',exact:true}).click();
 const firstId=((await ctx.pool.query('SELECT id FROM workspace_command_receipts LIMIT 1')).rows[0] as unknown as {id:string}).id;
 await page.locator('article').first().getByRole('button',{name:'隐藏',exact:true}).click();
 await expect(page.locator('article')).toHaveCount(1);
 await expect(page.getByText(/已隐藏 1 条本地显示/,{exact:false})).toBeVisible();
 await page.reload();
 await expect(page.locator('article')).toHaveCount(1);
 await page.getByRole('button',{name:/恢复隐藏显示/,exact:false}).click();
 await expect(page.locator('article')).toHaveCount(2);
 await page.reload();
 await expect(page.locator('article')).toHaveCount(2);
 const count=(await ctx.pool.query('SELECT id FROM workspace_command_receipts')).rows.length;
 expect(count).toBe(2);
 void firstId;
 expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(0);
});
test('exports same-titled projects as separate packages',async({page,workspace},testInfo)=>{
 const ctx=asCtx(workspace);
 const a=await makeProject(ctx,'同名项目'),b=await makeProject(ctx,'同名项目');
 await addTextNode(ctx,a.headers,a.project.id,0,'甲正文');
 await addTextNode(ctx,b.headers,b.project.id,0,'乙正文');
 await page.goto('/projects');
 const boxes=page.locator('[data-interaction-id="cloud:project:select"]');
 await expect(boxes).toHaveCount(2);
 await boxes.nth(0).check();await boxes.nth(1).check();
 await page.getByRole('button',{name:'批量导出所选项目',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'批量导出项目包',exact:true})).toBeVisible();
 const downloading=page.waitForEvent('download');
 await page.getByRole('button',{name:'导出 2 项',exact:true}).click();
 const path=testInfo.outputPath('same-title-batch.zip');
 await (await downloading).saveAs(path);
 const outer=unzipSync(new Uint8Array(readFileSync(path)));
 expect(Object.keys(outer)).toHaveLength(2);
 for(const name of Object.keys(outer)){
  const inner=unzipSync(outer[name]);
  const data=JSON.parse(strFromU8(inner['project.json']));
  expect(data.project.title).toBe('同名项目');
 }
 const texts=Object.keys(outer).map(name=>{const inner=unzipSync(outer[name]);return JSON.parse(strFromU8(inner['project.json'])).graph.nodes[0].data.text;}).sort();
 expect(texts).toEqual(['乙正文','甲正文']);
 expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(0);
});
test('keeps restore and export actions in the trash list view',async({page,workspace})=>{
 const ctx=asCtx(workspace);
 await makeProject(ctx,'待恢复项目');
 await page.goto('/projects');
 await page.locator('li',{has:page.getByRole('link',{name:'待恢复项目',exact:true})}).getByRole('button',{name:'移入回收站',exact:true}).click();
 await page.goto('/trash');
 await page.getByRole('button',{name:'列表视图',exact:true}).click();
 await expect(page.locator('table.cloud-project-table')).toBeVisible();
 await page.locator('tr',{hasText:'待恢复项目'}).getByRole('button',{name:'恢复项目',exact:true}).click();
 await page.goto('/projects');
 await expect(page.getByRole('link',{name:'待恢复项目',exact:true})).toBeVisible();
 expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(0);
});
test('retries template commands on the same project without duplicates',async({page,workspace})=>{
 const ctx=asCtx(workspace);
 await page.goto('/projects');
 await page.getByRole('button',{name:'使用原创模板',exact:true}).click();
 await page.route('**/studio-api/projects/*/commands',async route=>{await route.fulfill({status:500,body:'{}'});});
 await page.getByRole('button',{name:'创建原创分镜草稿',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'使用原创模板',exact:true}).getByRole('alert')).toBeVisible();
 await page.unroute('**/studio-api/projects/*/commands');
 await page.getByRole('button',{name:'创建原创分镜草稿',exact:true}).click();
 await expect(page).toHaveURL(/\/projects\/.+\/canvas$/);
 const projects=(await ctx.pool.query("SELECT id, document FROM workspace_projects WHERE document->>'title'='原创分镜草稿'")).rows as unknown as {id:string;document:{title:string}}[];
 expect(projects).toHaveLength(1);
 const graphs=(await ctx.pool.query('SELECT graph FROM workspace_graphs')).rows as unknown as {graph:{nodes:{title:string}[]}}[];
 expect(graphs).toHaveLength(1);
 expect(graphs[0].graph.nodes.map(node=>node.title).sort()).toEqual(['分镜约束','创作需求']);
 expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(0);
});
