import {createHash,randomUUID} from 'node:crypto';
import type {Graph} from '../../src/domain/graph';
import {test,expect} from '../helpers/cloud-workspace-ui-fixture';
test('copies and pastes canvas nodes through the actual controls and persists the resulting graph',async({page,workspace})=>{
 const project=(await workspace.call('POST','/studio-api/projects',{...workspace.headers(workspace.account),payload:{title:'画布操作验收'}})).json();
 await page.goto('/projects/'+project.id+'/canvas');await page.getByRole('button',{name:'展开侧栏',exact:true}).click();await page.getByRole('button',{name:'添加文字节点',exact:true}).click();await page.getByLabel('节点文本',{exact:true}).fill('复制后仍需保留的正文');await expect(page.getByRole('status').first()).toContainText('已保存');
 await page.getByRole('button',{name:'复制节点',exact:true}).click();await expect(page.getByRole('button',{name:'粘贴节点',exact:true})).toBeEnabled();await page.getByRole('button',{name:'粘贴节点',exact:true}).click();await expect(page.locator('.canvas-node')).toHaveCount(2);await expect(page.getByRole('status').first()).toContainText('已保存');await page.reload();await expect(page.locator('.canvas-node')).toHaveCount(2);await expect(page.getByLabel('节点文本',{exact:true}).first()).toHaveValue('复制后仍需保留的正文');expect(workspace.providerCalls).toHaveLength(0);
});
test('uses grouping, layout, locking, view tools, undo and reload controls on the persisted cloud canvas',async({page,workspace})=>{
 test.setTimeout(90000);
 const project=(await workspace.call('POST','/studio-api/projects',{...workspace.headers(workspace.account),payload:{title:'完整画布工具'}})).json(),saved=async()=>expect(page.getByRole('status').first()).toContainText('已保存');
 await page.goto('/projects/'+project.id+'/canvas');await page.getByRole('button',{name:'展开侧栏',exact:true}).click();await page.getByRole('button',{name:'添加文字节点',exact:true}).click();await saved();await page.getByRole('button',{name:'添加文字节点',exact:true}).click();await saved();
 const selection=page.locator('[data-interaction-id="ui:NodeOutline:input:f09b25dd00af"]');await selection.nth(0).check();await selection.nth(1).check();await page.getByRole('button',{name:'整理布局',exact:true}).click();await page.getByRole('dialog',{name:'预览布局',exact:true}).getByRole('button',{name:'应用布局',exact:true}).click();await saved();await page.getByRole('button',{name:'组合选中',exact:true}).click();await page.getByRole('dialog',{name:'新建分组',exact:true}).getByRole('button',{name:'创建分组',exact:true}).click();await saved();await expect(page.locator('.node-group')).toHaveCount(1);
 await page.getByRole('button',{name:'折叠分组',exact:true}).click();await saved();await expect(page.locator('.canvas-node')).toHaveCount(1);await page.getByLabel('云端画布',{exact:true}).getByRole('button',{name:'展开分组',exact:true}).click();await saved();await expect(page.locator('.canvas-node')).toHaveCount(3);await page.getByRole('button',{name:'解除分组',exact:true}).click();await saved();await expect(page.locator('.canvas-node')).toHaveCount(2);
 await page.locator('.node-text header').first().click();await page.getByRole('button',{name:'锁定选中',exact:true}).click();await saved();await expect(page.getByLabel('节点文本',{exact:true}).first()).toHaveAttribute('readonly','');await page.getByRole('button',{name:'解锁选中',exact:true}).click();await saved();await expect(page.getByLabel('节点文本',{exact:true}).first()).toBeEnabled();
 await page.getByRole('button',{name:'平移 H',exact:true}).click();await expect(page.getByRole('button',{name:'平移 H',exact:true})).toHaveAttribute('aria-pressed','true');await page.getByRole('button',{name:'选择 V',exact:true}).click();await page.getByRole('button',{name:'缩小',exact:true}).click();await saved();await page.getByRole('button',{name:'放大',exact:true}).click();await saved();await page.getByLabel('缩放百分比',{exact:true}).fill('80');await page.getByLabel('缩放百分比',{exact:true}).press('Enter');await saved();await page.getByRole('button',{name:'适配全部',exact:true}).click();await saved();await page.getByRole('button',{name:'定位选中',exact:true}).click();await saved();await page.getByRole('button',{name:'显示小地图',exact:true}).click();await expect(page.getByLabel('画布小地图',{exact:true})).toBeVisible();await page.getByRole('button',{name:'隐藏小地图',exact:true}).click();await page.getByRole('combobox',{name:'画布背景',exact:true}).selectOption('grid');await expect(page.getByRole('region',{name:'云端画布',exact:true})).toHaveClass(/background-grid/);
 await page.getByLabel('节点文本',{exact:true}).first().fill('待放弃的正文');await page.getByRole('button',{name:'重新加载画布',exact:true}).click();await page.getByRole('button',{name:'保留输入',exact:true}).click();await saved();await page.getByRole('button',{name:'撤销',exact:true}).click();await saved();await page.getByRole('button',{name:'重做',exact:true}).click();await saved();
 await page.getByLabel('节点文本',{exact:true}).first().fill('应明确放弃的正文');await page.getByRole('button',{name:'重新加载画布',exact:true}).click();await page.getByRole('button',{name:'放弃未保存输入并重新加载',exact:true}).click();await saved();await expect(page.getByLabel('节点文本',{exact:true}).first()).toHaveValue('待放弃的正文');
 await selection.nth(0).check();await selection.nth(1).check();await page.getByRole('button',{name:'删除选中节点',exact:true}).click();await page.getByRole('dialog',{name:'删除节点',exact:true}).getByRole('button',{name:'确认删除节点',exact:true}).click();await saved();await expect(page.locator('.canvas-node')).toHaveCount(0);await page.getByRole('button',{name:'撤销',exact:true}).click();await saved();await expect(page.locator('.canvas-node')).toHaveCount(2);await page.reload();await expect(page.locator('.canvas-node')).toHaveCount(2);expect(workspace.providerCalls).toHaveLength(0);
});
test('edits project and asset metadata, searches and archives, and restores owned trash through the actual buttons',async({page,workspace})=>{
 test.setTimeout(60000);
 await workspace.call('POST','/studio-api/projects',{...workspace.headers(workspace.account),payload:{title:'初始项目'}});await page.goto('/projects');await page.getByRole('button',{name:'修改项目信息',exact:true}).click();await page.getByLabel('项目名称',{exact:true}).fill('修改后的项目');await page.getByLabel('项目说明',{exact:true}).fill('项目说明');await page.getByLabel('项目标签（逗号分隔）',{exact:true}).fill('验收,云端');await page.getByRole('button',{name:'保存项目信息',exact:true}).click();await expect(page.getByRole('link',{name:'修改后的项目',exact:true})).toBeVisible();await page.getByRole('button',{name:'星标',exact:true}).click();await expect(page.getByRole('button',{name:'取消星标',exact:true})).toBeVisible();await page.getByRole('button',{name:'取消星标',exact:true}).click();await page.getByRole('button',{name:'归档',exact:true}).click();await page.getByRole('combobox',{name:'项目筛选',exact:true}).selectOption('archived');await expect(page.getByRole('link',{name:'修改后的项目',exact:true})).toBeVisible();await page.getByRole('button',{name:'取消归档',exact:true}).click();await page.getByRole('combobox',{name:'项目筛选',exact:true}).selectOption('all');await page.getByLabel('搜索项目',{exact:true}).fill('云端');await page.getByRole('combobox',{name:'排序',exact:true}).selectOption('title');await page.getByRole('button',{name:'重新加载项目',exact:true}).click();await expect(page.getByRole('link',{name:'修改后的项目',exact:true})).toBeVisible();await page.getByRole('button',{name:'移入回收站',exact:true}).click();await page.getByRole('link',{name:'回收站',exact:true}).click();await page.getByRole('button',{name:'恢复项目',exact:true}).click();await expect(page.getByRole('button',{name:'恢复项目',exact:true})).toHaveCount(0);
 await page.getByRole('link',{name:'素材',exact:true}).click();const png=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=2;return canvas.toDataURL('image/png').split(',')[1];});await page.getByLabel('选择素材文件',{exact:true}).setInputFiles({name:'初始素材.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});await page.getByRole('button',{name:'上传到云端',exact:true}).click();await expect(page.getByText('初始素材.png',{exact:true})).toBeVisible();await page.getByRole('button',{name:'修改素材信息',exact:true}).click();await page.getByLabel('素材名称',{exact:true}).fill('修改后的素材');await page.getByLabel('素材说明',{exact:true}).fill('恢复时应保留的说明');await page.getByLabel('素材标签（逗号分隔）',{exact:true}).fill('验收');await page.getByRole('button',{name:'保存素材信息',exact:true}).click();await expect(page.getByText('修改后的素材',{exact:true})).toBeVisible();await page.getByLabel('搜索素材',{exact:true}).fill('验收');await page.getByRole('combobox',{name:'素材类型',exact:true}).selectOption('image');await page.getByRole('button',{name:'重新加载素材',exact:true}).click();await page.getByRole('button',{name:'移入回收站',exact:true}).click();await page.getByRole('link',{name:'回收站',exact:true}).click();await page.getByRole('button',{name:'恢复素材',exact:true}).click();await page.getByRole('link',{name:'素材',exact:true}).click();await expect(page.getByText('恢复时应保留的说明',{exact:true})).toBeVisible();expect(workspace.providerCalls).toHaveLength(0);
});
test('shows asset details with hash and node references and navigates to the canvas',async({page,workspace})=>{
 const ctx=workspace as unknown as {headers(a:unknown):Record<string,string>;call(m:string,p:string,o?:unknown):Promise<{json:()=>unknown;statusCode:number}>;pool:{query(t:string,v?:unknown[]):Promise<{rows:{id?:string;document?:{sha256?:string}}[]}>};account:{view:{user:{id:string}}}};
 const headers=ctx.headers(ctx.account);
 const project=(await workspace.call('POST','/studio-api/projects',{...headers,payload:{title:'引用项目'}})).json() as {id:string};
 await page.goto('/assets');
 const png=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=2;return canvas.toDataURL('image/png').split(',')[1];});
 await page.getByLabel('选择素材文件',{exact:true}).setInputFiles({name:'详情素材.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
 await page.getByRole('button',{name:'上传到云端',exact:true}).click();
 await expect(page.getByText('详情素材.png',{exact:true})).toBeVisible();
 const assetId=((await ctx.pool.query('SELECT id FROM workspace_assets')).rows[0] as unknown as {id:string}).id;
 const assetSha=((await ctx.pool.query('SELECT document FROM workspace_assets WHERE id=$1',[assetId])).rows[0] as unknown as {document:{sha256:string}}).document.sha256;
 const nodeId='00000000-0000-4000-8000-111111111111';
 expect((await ctx.call('POST','/studio-api/projects/'+project.id+'/commands',{...headers,payload:{expectedRevision:0,idempotencyKey:'00000000-0000-4000-8000-222222222222',command:{type:'operations',operations:[{id:'00000000-0000-4000-8000-333333333333',type:'add_node',payload:{node:{id:nodeId,type:'asset',title:'引用节点',x:10,y:10,locked:false,data:{kind:'asset',assetId}}}}]}}})).statusCode).toBe(200);
 await page.goto('/assets');
 await page.locator('article',{has:page.getByText('详情素材.png',{exact:true})}).getByRole('button',{name:'查看详情',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'素材详情',exact:true});
 await expect(dialog).toContainText(assetSha.slice(0,16));
 await expect(dialog).toContainText('引用项目');
 await expect(dialog).toContainText('引用节点');
 await dialog.getByRole('link',{name:'定位项目画布',exact:true}).first().click();
 await expect(page).toHaveURL(new RegExp('/projects/'+project.id+'/canvas'));
 expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(0);
});
test('lists every current node using the asset and keeps late responses from overwriting',async({page,workspace})=>{
 const ctx=workspace as unknown as {headers(a:unknown):Record<string,string>;call(m:string,p:string,o?:unknown):Promise<{json:()=>unknown;statusCode:number}>;pool:{query(t:string,v?:unknown[]):Promise<{rows:{id?:string}[]}>};account:{view:{user:{id:string}}}};
 const headers=ctx.headers(ctx.account);
 const project=(await workspace.call('POST','/studio-api/projects',{...headers,payload:{title:'多节点项目'}})).json() as {id:string};
 await page.goto('/assets');
 const png=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=2;return canvas.toDataURL('image/png').split(',')[1];});
 await page.getByLabel('选择素材文件',{exact:true}).setInputFiles({name:'多节点素材.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
 await page.getByRole('button',{name:'上传到云端',exact:true}).click();
 await expect(page.getByText('多节点素材.png',{exact:true})).toBeVisible();
 const assetId=((await ctx.pool.query('SELECT id FROM workspace_assets')).rows[0] as unknown as {id:string}).id;
 expect((await ctx.call('POST','/studio-api/projects/'+project.id+'/commands',{...headers,payload:{expectedRevision:0,idempotencyKey:'00000000-0000-4000-8000-444444444444',command:{type:'operations',operations:[{id:'00000000-0000-4000-8000-555555555555',type:'add_node',payload:{node:{id:'00000000-0000-4000-8000-666666666666',type:'asset',title:'当前节点甲',x:10,y:10,locked:false,data:{kind:'asset',assetId}}}},{id:'00000000-0000-4000-8000-777777777777',type:'add_node',payload:{node:{id:'00000000-0000-4000-8000-888888888888',type:'asset',title:'当前节点乙',x:100,y:100,locked:false,data:{kind:'asset',assetId}}}}]}}})).statusCode).toBe(200);
 await page.goto('/assets');
 await page.locator('article',{has:page.getByText('多节点素材.png',{exact:true})}).getByRole('button',{name:'查看详情',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'素材详情',exact:true});
 await expect(dialog.getByText('当前节点甲',{exact:false})).toBeVisible();
 await expect(dialog.getByText('当前节点乙',{exact:false})).toBeVisible();
 await dialog.locator('p',{hasText:'当前节点甲'}).getByRole('link',{name:'定位项目画布',exact:true}).click();
 const url=new URL(page.url());
 expect(url.searchParams.get('node')).toBeTruthy();
 expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(0);
});
test('lists nested text and video bindings using the asset',async({page,workspace},testInfo)=>{
 const h=workspace.headers(workspace.account),bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6nRAAAAAASUVORK5CYII=','base64');
 const reserve=await workspace.call('POST','/studio-api/assets',{...h,payload:{title:'嵌套引用素材',mimeType:'image/png',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}});expect(reserve.statusCode).toBe(201);const assetId=reserve.json<{id:string}>().id;
 expect((await workspace.app.inject({method:'PUT',url:'/studio-api/assets/'+assetId+'/content',payload:bytes,headers:{cookie:h.cookie,'x-workspace-context':h.context,'x-csrf-token':h.csrf,origin:'https://studio.test','content-type':'application/octet-stream'}})).statusCode).toBe(204);
 expect((await workspace.call('POST','/studio-api/assets/'+assetId+'/complete',{...h,payload:{}})).statusCode).toBe(200);
 const project=await workspace.call('POST','/studio-api/projects',{...h,payload:{title:'真实嵌套引用项目'}});expect(project.statusCode).toBe(201);const projectId=project.json<{id:string}>().id,assetNodeId=randomUUID(),textId=randomUUID(),videoId=randomUUID();
 const nodes=[{id:assetNodeId,type:'asset',title:'直接素材节点',x:40,y:40,locked:false,data:{kind:'asset',assetId}},{id:textId,type:'text',title:'文字素材引用节点',x:40,y:400,locked:false,data:{kind:'text',text:'含明确素材引用的文字',referenceTokens:[{assetId,alias:'ref',mediaType:'image',role:'reference',description:'合成素材',available:true,unbound:false}]}},{id:videoId,type:'video-generation',title:'视频输入绑定节点',x:600,y:40,locked:false,data:{kind:'video-generation',draft:{modelId:'seedance'},inputBindings:[],stale:true}}];
 const saved=await workspace.call('POST','/studio-api/projects/'+projectId+'/commands',{...h,payload:{expectedRevision:0,idempotencyKey:randomUUID(),command:{type:'operations',operations:[...nodes.map(node=>({id:randomUUID(),type:'add_node',payload:{node}})),{id:randomUUID(),type:'add_edge',payload:{edge:{id:randomUUID(),sourceId:assetNodeId,targetId:videoId,port:'image',order:0}}}]}}});expect(saved.statusCode).toBe(200);const graph=saved.json<{graph:Graph}>().graph,video=graph.nodes.find(n=>n.id===videoId);expect(video?.type).toBe('video-generation');if(video?.type!=='video-generation')throw Error('video fixture missing');expect(video.data.inputBindings).toContainEqual({nodeId:assetNodeId,assetId,order:0,role:'image'});
 const response=await workspace.call('GET','/studio-api/assets/'+assetId+'/references',h);expect(response.statusCode).toBe(200);const refs=response.json<{source:string;current:boolean;nodeId?:string}[]>();
 await testInfo.attach('actual-nested-asset-usage',{contentType:'application/json',body:JSON.stringify({expectedBoundNodes:nodes.map(n=>({id:n.id,title:n.title})),actual:refs,persistedVideoBindings:video.data.inputBindings,actualGraph:graph})});
 expect.soft(refs.filter(r=>r.current).map(r=>r.nodeId).sort()).toEqual([assetNodeId,textId,videoId].sort());
 await page.goto('/assets');await page.getByRole('button',{name:'查看详情',exact:true}).click();const dialog=page.getByRole('dialog',{name:'素材详情',exact:true});await expect(dialog).toContainText('直接素材节点');await expect.soft(dialog).toContainText('文字素材引用节点');await expect.soft(dialog).toContainText('视频输入绑定节点');expect(workspace.providerCalls).toHaveLength(0);
});

test('keeps the later asset selection when an earlier detail response arrives late',async({page,workspace})=>{
 const ctx=workspace as unknown as {headers(a:unknown):Record<string,string>;call(m:string,p:string,o?:unknown):Promise<{json:()=>unknown;statusCode:number}>;account:{view:{user:{id:string}}}};
 const headers=ctx.headers(ctx.account);
 await page.goto('/assets');
 const png=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=2;return canvas.toDataURL('image/png').split(',')[1];});
 await page.getByLabel('选择素材文件',{exact:true}).setInputFiles({name:'甲素材.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
 await page.getByRole('button',{name:'上传到云端',exact:true}).click();
 await expect(page.getByText('甲素材.png',{exact:true})).toBeVisible();
 await page.getByLabel('选择素材文件',{exact:true}).setInputFiles({name:'乙素材.png',mimeType:'image/png',buffer:Buffer.from(await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=3;canvas.height=3;return canvas.toDataURL('image/png').split(',')[1];}),'base64')});
 await page.getByRole('button',{name:'上传到云端',exact:true}).click();
 await expect(page.getByText('乙素材.png',{exact:true})).toBeVisible();
 let n=0;
 await page.route('**/studio-api/assets/*/references',async route=>{
  n++;
  if(n===1)await new Promise(resolve=>setTimeout(resolve,1000));
  await route.fallback();
 });
 await page.locator('article',{has:page.getByText('甲素材.png',{exact:true})}).getByRole('button',{name:'查看详情',exact:true}).click();
 await page.locator('article',{has:page.getByText('乙素材.png',{exact:true})}).getByRole('button',{name:'查看详情',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'素材详情',exact:true});
 await expect(dialog).toContainText('乙素材.png');
 await expect(dialog).not.toContainText('甲素材.png');
 await page.unroute('**/studio-api/assets/*/references');
 expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(0);
 void headers;
});
test('workspace fills the viewport width and canvas fills the remaining height at desktop boundaries',async({page,workspace},testInfo)=>{
 const project=(await workspace.call('POST','/studio-api/projects',{...workspace.headers(workspace.account),payload:{title:'布局验收'}})).json();
 for(const viewport of [{width:1366,height:768},{width:1920,height:1080}]){
  await page.setViewportSize(viewport);await page.goto('/projects');
  const shell=await page.locator('.account-shell').boundingBox();if(!shell)throw new Error('Missing shell');
  expect(Math.abs(shell.width-viewport.width)).toBeLessThan(4);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.goto('/projects/'+project.id+'/canvas');await page.getByRole('button',{name:'展开侧栏',exact:true}).click();
  await expect(page.getByRole('toolbar',{name:'画布工具',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'生成视频',exact:true})).toBeVisible();
  const stage=await page.locator('.canvas-stage').boundingBox();if(!stage)throw new Error('Missing stage');
  expect(stage.height).toBeGreaterThan(300);expect(stage.y+stage.height).toBeGreaterThan(viewport.height-120);
  expect(stage.y+stage.height).toBeLessThanOrEqual(viewport.height+8);
  const generateBox=await page.getByRole('button',{name:'生成视频',exact:true}).boundingBox();if(!generateBox)throw new Error('Missing generate entry');
  expect(generateBox.y+generateBox.height).toBeLessThanOrEqual(viewport.height+8);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('cloud-layout-'+viewport.width+'x'+viewport.height+'.png')});
 }
 expect(workspace.providerCalls).toHaveLength(0);
});
test('collapsing the side panel and outline expands the canvas stage',async({page,workspace})=>{
 const project=(await workspace.call('POST','/studio-api/projects',{...workspace.headers(workspace.account),payload:{title:'收起验收'}})).json();
 await page.setViewportSize({width:1366,height:768});await page.goto('/projects/'+project.id+'/canvas');await page.getByRole('button',{name:'展开侧栏',exact:true}).click();
 await page.getByRole('button',{name:'添加文字节点',exact:true}).click();await expect(page.getByRole('status').first()).toContainText('已保存');
 const before=(await page.locator('.canvas-stage').boundingBox())?.width??0;expect(before).toBeGreaterThan(0);
 await page.getByRole('button',{name:'收起侧栏',exact:true}).click();await expect(page.getByRole('button',{name:'展开侧栏',exact:true})).toBeVisible();
 const noSide=(await page.locator('.canvas-stage').boundingBox())?.width??0;expect(noSide).toBeGreaterThan(before);
 await page.getByRole('button',{name:'隐藏节点列表',exact:true}).click();
 const noOutline=(await page.locator('.canvas-stage').boundingBox())?.width??0;expect(noOutline).toBeGreaterThan(noSide);
 await page.getByRole('button',{name:'展开侧栏',exact:true}).click();await page.getByRole('button',{name:'显示节点列表',exact:true}).click();
 await expect(page.getByRole('button',{name:'生成视频',exact:true})).toBeVisible();expect(workspace.providerCalls).toHaveLength(0);
});
test('a small viewport keeps generation reachable and reports missing input without upstream calls',async({page,workspace})=>{
 const h=workspace.headers(workspace.account);
 expect((await workspace.call('PATCH','/studio-api/me/model-configs/video',{...h,payload:{apiBase:'https://video.example.test',model:'seedance',apiKey:'FAKE_VIDEO_UI_KEY',expectedRevision:null}})).statusCode).toBe(200);
 const project=(await workspace.call('POST','/studio-api/projects',{...h,payload:{title:'小屏可操作'}})).json();
 const v1='11111111-1111-4111-8111-111111111111';
 await workspace.call('POST','/studio-api/projects/'+project.id+'/commands',{...h,payload:{expectedRevision:0,idempotencyKey:'22222222-2222-4222-8222-222222222222',command:{type:'operations',operations:[{id:'33333333-3333-4333-8333-333333333333',type:'add_node',payload:{node:{id:v1,type:'video-generation',title:'视频草稿',x:440,y:40,locked:false,data:{kind:'video-generation',draft:{modelId:'seedance',durationSeconds:5,ratio:'16:9',resolution:'480p'},inputBindings:[],stale:true}}}}]}}});
 await page.setViewportSize({width:1366,height:768});await page.goto('/projects/'+project.id+'/canvas');await page.getByRole('button',{name:'展开侧栏',exact:true}).click();
 const generate=page.locator('[data-interaction-id="V-08"]');await generate.scrollIntoViewIfNeeded();await expect(generate).toBeEnabled();await generate.click();
 await expect(page.getByText('这个视频草稿还没有提示词',{exact:false}).first()).toBeVisible();
 await expect(page.getByText('缺少明确连接的提示词正文',{exact:false})).toBeVisible();expect(workspace.providerCalls.filter(call=>!((call.method??'GET')==='GET'&&['/healthz','/v1/models'].includes(new URL(call.url).pathname)))).toHaveLength(0);
});
test('desktop canvas bottom stays within the remaining viewport at desktop boundaries',async({page,workspace},testInfo)=>{
 const project=(await workspace.call('POST','/studio-api/projects',{...workspace.headers(workspace.account),payload:{title:'布局边界验收'}})).json();
 const measurements=[];
 for(const viewport of [{width:1366,height:768},{width:1920,height:1080}]){
  await page.setViewportSize(viewport);await page.goto('/projects/'+project.id+'/canvas');await page.getByRole('button',{name:'展开侧栏',exact:true}).click();
  await expect(page.getByRole('button',{name:'生成视频',exact:true})).toBeVisible();
  const stage=await page.locator('.canvas-stage').boundingBox();if(!stage)throw Error('Missing canvas');
  const measure={...viewport,stage,bottom:stage.y+stage.height,documentHeight:await page.evaluate(()=>document.documentElement.scrollHeight)};
  measurements.push(measure);
  await page.screenshot({path:testInfo.outputPath('audit-layout-'+viewport.width+'.png'),fullPage:true});
  expect.soft(measure.bottom,'canvas bottom must stay near viewport bottom at '+viewport.width).toBeLessThanOrEqual(viewport.height+4);
  expect.soft(measure.bottom).toBeGreaterThan(viewport.height-64);
 }
 await testInfo.attach('layout-measurements',{body:JSON.stringify(measurements,null,2),contentType:'application/json'});
 expect(workspace.providerCalls).toHaveLength(0);
});
test('collapsing the sidebar preserves unsaved video input without Agent controls',async({page,workspace})=>{
 const h=workspace.headers(workspace.account);
 expect((await workspace.call('PATCH','/studio-api/me/model-configs/video',{...h,payload:{apiBase:'https://video.example.test',model:'seedance',apiKey:'FAKE_VIDEO_UI_KEY',expectedRevision:null}})).statusCode).toBe(200);
 const project=(await workspace.call('POST','/studio-api/projects',{...h,payload:{title:'侧栏输入保留'}})).json();
 const nodeId='44444444-4444-4444-8444-444444444444';
 expect((await workspace.call('POST','/studio-api/projects/'+project.id+'/commands',{...h,payload:{expectedRevision:0,idempotencyKey:'55555555-5555-4555-8555-555555555555',command:{type:'operations',operations:[{id:'66666666-6666-4666-8666-666666666666',type:'add_node',payload:{node:{id:nodeId,type:'video-generation',title:'视频草稿',x:440,y:40,locked:false,data:{kind:'video-generation',draft:{modelId:'seedance',durationSeconds:5,ratio:'16:9',resolution:'480p'},inputBindings:[],stale:true}}}}]}}})).statusCode).toBe(200);
 await page.goto('/projects/'+project.id+'/canvas');await page.getByRole('button',{name:'展开侧栏',exact:true}).click();
 await page.getByLabel('为视频草稿填写提示词',{exact:true}).fill('尚未保存的视频正文');
 await page.getByRole('button',{name:'收起侧栏',exact:true}).click();
 await page.getByRole('button',{name:'展开侧栏',exact:true}).click();
 await expect(page.getByLabel('为视频草稿填写提示词',{exact:true})).toHaveValue('尚未保存的视频正文');
 await expect(page.getByRole('button',{name:/Agent 协作|Agent 提案/})).toHaveCount(0);
 expect(workspace.providerCalls.filter(call=>!((call.method??'GET')==='GET'&&['/healthz','/v1/models'].includes(new URL(call.url).pathname)))).toHaveLength(0);
});
test('a narrow short viewport degrades to a scrollable layout with a usable canvas floor',async({page,workspace},testInfo)=>{
 const project=(await workspace.call('POST','/studio-api/projects',{...workspace.headers(workspace.account),payload:{title:'窄窗退化'}})).json();
 await page.setViewportSize({width:800,height:600});await page.goto('/projects/'+project.id+'/canvas');await page.getByRole('button',{name:'展开侧栏',exact:true}).click();
 const stage=await page.locator('.canvas-stage').boundingBox();if(!stage)throw new Error('Missing stage');
 expect(stage.height).toBeGreaterThanOrEqual(300);
 const side=await page.locator('.canvas-side').boundingBox();if(!side)throw new Error('Missing side');
 expect(side.height).toBeGreaterThan(100);
 const generate=page.getByRole('button',{name:'生成视频',exact:true});await generate.scrollIntoViewIfNeeded();await expect(generate).toBeVisible();
 await page.screenshot({path:testInfo.outputPath('audit-layout-800x600.png'),fullPage:true});
 expect(workspace.providerCalls).toHaveLength(0);
});
