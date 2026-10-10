import {randomUUID} from 'node:crypto';
import {test,expect} from '../helpers/cloud-workspace-ui-fixture';
type GraphLike={nodes:{id:string;type:string;title:string;data:Record<string,unknown>}[];edges:{id:string;sourceId:string;targetId:string;port:string;order:number;relation?:string}[]};
type Row={n?:number;document?:Record<string,unknown>;graph?:GraphLike};
type Ctx={headers(account:unknown):Record<string,string>;call(method:string,path:string,options?:unknown):Promise<{json:()=>unknown;statusCode:number}>;pool:{query(text:string,values?:unknown[]):Promise<{rows:Row[]}>};account:{view:{user:{id:string}}}};
const asCtx=(value:unknown)=>value as Ctx;
const receiptQuery="SELECT count(*)::int n FROM workspace_command_receipts WHERE project_id=$1";
const assetQuery="SELECT count(*)::int n FROM workspace_assets WHERE user_id=$1 AND state='complete'";
const countOf=async(value:unknown,query:string,values:unknown[])=>(await asCtx(value).pool.query(query,values)).rows[0].n as number;
const graphOf=async(value:unknown,projectId:string)=>(await asCtx(value).pool.query('SELECT graph FROM workspace_graphs WHERE project_id=$1',[projectId])).rows[0].graph!;
async function configureVideo(value:unknown){
 const ctx=asCtx(value),headers=ctx.headers(ctx.account);
 expect((await ctx.call('PATCH','/studio-api/me/model-configs/video',{...headers,payload:{apiBase:'https://video.example.test',model:'seedance',apiKey:'FAKE_VIDEO_UI_KEY',expectedRevision:null}})).statusCode).toBe(200);
}
function seedProject(value:unknown,title:string,count=1,referenceAssetId?:string){
 const ctx=asCtx(value),headers=ctx.headers(ctx.account),operations:{id:string;type:string;payload:Record<string,unknown>}[]=[],nodeIds:string[]=[];
 for(let index=0;index<count;index++){
  const textId=randomUUID(),nodeId=randomUUID();nodeIds.push(nodeId);
  operations.push({id:randomUUID(),type:'add_node',payload:{node:{id:textId,type:'text',title:'创意'+(index+1),x:40,y:40+480*index,locked:false,data:{kind:'text',text:'雨后的街道，一镜到底',referenceTokens:[]}}}});
  operations.push({id:randomUUID(),type:'add_node',payload:{node:{id:nodeId,type:'video-generation',title:'视频草稿'+(index+1),x:440,y:40+480*index,locked:false,data:{kind:'video-generation',draft:{modelId:'seedance',durationSeconds:5,ratio:'16:9',resolution:'480p'},inputBindings:[],stale:true}}}});
  operations.push({id:randomUUID(),type:'add_edge',payload:{edge:{id:randomUUID(),sourceId:textId,targetId:nodeId,port:'text',order:0}}});
  if(referenceAssetId&&index===0){
   const assetId=randomUUID();
   operations.push({id:randomUUID(),type:'add_node',payload:{node:{id:assetId,type:'asset',title:'参考图',x:40,y:600,locked:false,data:{kind:'asset',assetId:referenceAssetId}}}});
   operations.push({id:randomUUID(),type:'add_edge',payload:{edge:{id:randomUUID(),sourceId:assetId,targetId:nodeId,port:'image',order:1}}});
  }
 }
 return Promise.resolve(ctx.call('POST','/studio-api/projects',{...headers,payload:{title}})).then(created=>created.json() as {id:string}).then(async project=>{
  expect((await ctx.call('POST','/studio-api/projects/'+project.id+'/commands',{...headers,payload:{expectedRevision:0,idempotencyKey:randomUUID(),command:{type:'operations',operations}}})).statusCode).toBe(200);
  return {projectId:project.id,nodeIds};
 });
}
async function generate(page:import('@playwright/test').Page,value:unknown,projectId:string,nodeIds:string[]){
 const ctx=asCtx(value);
 await page.goto('/projects/'+projectId+'/canvas');
 for(const nodeId of nodeIds){
  await page.locator('[data-node-id="'+nodeId+'"] [data-interaction-id="V-08"]').click();

  await page.getByRole('button',{name:'确认',exact:true}).click();
 }
 await expect.poll(async()=>(await ctx.pool.query("SELECT count(*)::int n FROM workspace_video_runs WHERE project_id=$1 AND document->>'executionState'='succeeded'",[projectId])).rows[0].n,{timeout:15000}).toBe(nodeIds.length);
 return (await ctx.pool.query('SELECT document FROM workspace_video_runs WHERE project_id=$1 ORDER BY created_at',[projectId])).rows.map(row=>row.document as {id:string;resultAssetId:string;inputSnapshot:{references:{alias:string;assetId:string}[]}});
}
test('generates a saved tail-frame continuation from its canvas node with the exact frame and prompt',async({page,workspace})=>{
 workspace.setVideoReferenceSupport({imageReferences:1,videoReferences:0,assetUploads:true});
 await configureVideo(workspace);
 const {projectId,nodeIds}=await seedProject(workspace,'续写生成入口'),[original]=await generate(page,workspace,projectId,nodeIds);
 await page.goto('/projects/'+projectId+'/results');await page.getByRole('button',{name:'尾帧续写',exact:true}).click();
 const tail=page.getByRole('dialog',{name:'尾帧续写',exact:true});
 await tail.locator('[data-interaction-id="cloud:results:tail-frame-time"]').fill('0.2');
 await tail.getByRole('button',{name:'抽取并预览尾帧',exact:true}).click();
 await expect(tail.locator('[data-interaction-id="cloud:results:tail-frame-preview"]')).toBeVisible();
 await tail.locator('[data-interaction-id="cloud:results:tail-frame-prompt"]').fill('从这张尾帧继续向前推进');
 await tail.getByRole('button',{name:'上传尾帧并保存续写流程',exact:true}).click();await expect(tail).not.toBeVisible();
 const graph=await graphOf(workspace,projectId),draft=graph.nodes.find(node=>node.title==='尾帧续写视频')!,frame=graph.nodes.find(node=>node.title==='尾帧参考')!;
 await page.goto('/projects/'+projectId+'/canvas?node='+draft.id);
 await page.locator('[data-node-id="'+draft.id+'"] [data-interaction-id="V-08"]').click();
 const confirm=page.getByRole('dialog',{name:'确认云端视频生成',exact:true});await expect(confirm).toBeVisible();
 const approvalRow=(await workspace.pool.query("SELECT id,document FROM workspace_video_previews WHERE project_id=$1 AND consumed_runs IS NULL ORDER BY (document->>'expiresAt')::bigint DESC",[projectId])).rows[0];
 expect(approvalRow.document.nodes[0].inputSnapshot.prompt).toContain('从这张尾帧继续向前推进');
 expect(approvalRow.document.nodes[0].assets.map((asset:{title:string})=>asset.title)).toContain('tail-frame-200ms.png');
 expect(workspace.providerCalls.filter(call=>call.method==='POST'&&call.url.endsWith('/v1/videos/generations'))).toHaveLength(1);
 await workspace.pool.query("UPDATE workspace_video_previews SET document=jsonb_set(document,'{expiresAt}',to_jsonb($2::bigint)) WHERE id=$1",[approvalRow.id,Date.now()-1]);
 await confirm.getByRole('button',{name:'确认',exact:true}).click();await expect(confirm.getByRole('alert')).toBeVisible();
 expect((await workspace.pool.query('SELECT count(*)::int n FROM workspace_video_runs WHERE project_id=$1',[projectId])).rows[0].n).toBe(1);
 await confirm.getByRole('button',{name:'确认',exact:true}).click();
 await expect.poll(async()=>(await workspace.pool.query("SELECT count(*)::int n FROM workspace_video_runs WHERE project_id=$1 AND document->>'executionState'='succeeded'",[projectId])).rows[0].n,{timeout:15000}).toBe(2);
 const continuation=(await workspace.pool.query("SELECT document FROM workspace_video_runs WHERE project_id=$1 AND document->>'nodeId'=$2",[projectId,draft.id])).rows[0].document;
 expect(continuation.inputSnapshot.references.map((reference:{assetId:string})=>reference.assetId)).toEqual([frame.data.assetId]);
 expect(continuation.inputSnapshot.prompt).toContain('从这张尾帧继续向前推进');
 expect((await workspace.call('GET','/studio-api/runs/'+original.id,workspace.headers(workspace.account))).json().inputSnapshot.prompt).toBe('雨后的街道，一镜到底');
});

test('optimizes a revision through the text API and saves a new draft while preserving the original result',async({page,workspace})=>{
 await configureVideo(workspace);const h=workspace.headers(workspace.account);
 await workspace.call('PATCH','/studio-api/me/model-configs/text',{...h,payload:{apiBase:'https://api.example.test',model:'Vendor/Cloud-Text',apiKey:'FAKE_TEXT_UI_KEY',expectedRevision:null}});
 const {projectId,nodeIds}=await seedProject(workspace,'修改 AI 贯通'),[run]=await generate(page,workspace,projectId,nodeIds);
 await page.goto('/projects/'+projectId+'/results');await page.getByRole('button',{name:'修改后重新生成',exact:true}).click();
 const revision=page.getByRole('dialog',{name:'修改后重新生成',exact:true});
 await revision.locator('[data-interaction-id="cloud:results:revision-prompt"]').fill('改成日落街道，保持原镜头');
 await revision.getByLabel('需要修正的问题',{exact:true}).fill('修复车轮变形，其余主体和动作保持');
 await revision.getByRole('button',{name:'文字 API 润色',exact:true}).click();
 const confirm=page.getByRole('dialog',{name:'确认 AI 文字优化',exact:true});await expect(confirm).toBeVisible();
 const saved=(await workspace.pool.query('SELECT document FROM workspace_content WHERE user_id=$1 AND kind=\'draft\' ORDER BY created_at DESC LIMIT 1',[workspace.account.view.user.id])).rows[0].document;
 expect(saved.sceneId).toBe('edit');expect(saved.userRequest).toContain('雨后的街道，一镜到底');expect(saved.userRequest).toContain('改成日落街道，保持原镜头');expect(saved.userRequest).toContain('修复车轮变形，其余主体和动作保持');
 expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(1);
 await confirm.getByLabel('我确认此文字调用可能收费',{exact:true}).check();await confirm.getByRole('button',{name:'确认调用文字模型',exact:true}).click();
 const panel=page.locator('.prompt-generator-panel');await expect(panel.getByLabel('结果正文',{exact:true})).toHaveValue('云端 AI 优化的雨后街道');
 await panel.getByRole('button',{name:'采用润色正文',exact:true}).click();
 await expect(revision.locator('[data-interaction-id="cloud:results:revision-prompt"]')).toHaveValue('云端 AI 优化的雨后街道');
 await revision.getByRole('button',{name:'保存为新的视频草稿',exact:true}).click();await expect(revision).not.toBeVisible();
 await expect(page).toHaveURL(new RegExp('/projects/'+projectId+'/canvas\\?node='));
 const graph=await graphOf(workspace,projectId);expect(graph.nodes.find(node=>node.title==='修改提示词')?.data.text).toBe('云端 AI 优化的雨后街道');
 expect(graph.nodes.filter(node=>node.type==='result')).toHaveLength(1);
 const original=(await workspace.call('GET','/studio-api/runs/'+run.id,h)).json();expect(original.inputSnapshot.prompt).toBe('雨后的街道，一镜到底');
 expect(workspace.providerCalls.filter(call=>call.method==='POST'&&call.url.includes('/videos/'))).toHaveLength(1);
 expect(workspace.providerCalls.filter(call=>call.method==='POST'&&call.url.includes('/chat/'))).toHaveLength(1);
});
test('tail-frame text polishing can be cancelled and explicitly adopted without changing the frame, original result or video specifications',async({page,workspace})=>{
 await configureVideo(workspace);const h=workspace.headers(workspace.account);
 await workspace.call('PATCH','/studio-api/me/model-configs/text',{...h,payload:{apiBase:'https://api.example.test',model:'Vendor/Cloud-Text',apiKey:'FAKE_TEXT_UI_KEY',expectedRevision:null}});
 const {projectId,nodeIds}=await seedProject(workspace,'续写文字润色'),[run]=await generate(page,workspace,projectId,nodeIds);
 await page.goto('/projects/'+projectId+'/results');await page.getByRole('button',{name:'尾帧续写',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'尾帧续写',exact:true});const prompt=dialog.locator('[data-interaction-id="cloud:results:tail-frame-prompt"]');
 await dialog.getByLabel('抽取时间（秒）',{exact:true}).fill('0.2');await dialog.getByRole('button',{name:'抽取并预览尾帧',exact:true}).click();await expect(dialog.getByAltText('尾帧预览')).toBeVisible();
 await prompt.fill('继续雨后街道，镜头慢慢抬高');
 await dialog.getByRole('button',{name:'文字 API 润色',exact:true}).click();
 let confirm=page.getByRole('dialog',{name:'确认 AI 文字优化',exact:true});await expect(confirm).toBeVisible();await confirm.getByRole('button',{name:'取消',exact:true}).click();
 await page.getByRole('button',{name:'关闭写作面板',exact:true}).click();await expect(prompt).toHaveValue('继续雨后街道，镜头慢慢抬高');await expect(dialog.getByAltText('尾帧预览')).toBeVisible();expect(workspace.providerCalls.filter(call=>call.method==='POST'&&call.url.includes('/chat/'))).toHaveLength(0);
 await dialog.getByRole('button',{name:'文字 API 润色',exact:true}).click();confirm=page.getByRole('dialog',{name:'确认 AI 文字优化',exact:true});await expect(confirm).toBeVisible();
 const frozen=(await workspace.pool.query("SELECT request_body FROM workspace_prompt_previews ORDER BY (document->>'expiresAt')::bigint DESC LIMIT 1")).rows[0].request_body;
 const body=JSON.parse(frozen);expect(body.messages[1].content).toEqual(expect.arrayContaining([expect.objectContaining({type:'image_url',image_url:expect.objectContaining({url:expect.stringMatching(/^data:image\/png;base64,/)} )})]));
 const source=JSON.parse(body.messages[1].content[0].text);expect(source.scene.title).toBe('视频延长');expect(source.userRequest).toContain('雨后的街道，一镜到底');expect(source.userRequest).toContain('继续雨后街道，镜头慢慢抬高');
 await confirm.getByLabel('我确认此文字调用可能收费',{exact:true}).check();await confirm.getByRole('button',{name:'确认调用文字模型',exact:true}).click();
 const panel=page.locator('.prompt-generator-panel');await expect(panel.getByLabel('结果正文',{exact:true})).toHaveValue('云端 AI 优化的雨后街道');await panel.getByRole('button',{name:'采用润色正文',exact:true}).click();
 await expect(prompt).toHaveValue('云端 AI 优化的雨后街道');await expect(dialog.getByLabel('抽取时间（秒）',{exact:true})).toHaveValue('0.2');await expect(dialog.getByAltText('尾帧预览')).toBeVisible();
 await dialog.getByRole('button',{name:'上传尾帧并保存续写流程',exact:true}).click();await expect(dialog).not.toBeVisible();
 await expect(page).toHaveURL(new RegExp('/projects/'+projectId+'/canvas\\?node='));
 const graph=await graphOf(workspace,projectId);expect(graph.nodes.find(node=>node.title==='续写提示词')?.data.text).toBe('云端 AI 优化的雨后街道');expect(graph.nodes.filter(node=>node.type==='result')).toHaveLength(1);
 const drafts=graph.nodes.filter(node=>node.type==='video-generation');expect(drafts).toHaveLength(2);expect(drafts[1].data.draft).toMatchObject({durationSeconds:5,ratio:'16:9',resolution:'480p'});
 expect((await workspace.call('GET','/studio-api/runs/'+run.id,h)).json().inputSnapshot).toEqual(run.inputSnapshot);
 expect(workspace.providerCalls.filter(call=>call.method==='POST'&&call.url.includes('/videos/'))).toHaveLength(1);expect(workspace.providerCalls.filter(call=>call.method==='POST'&&call.url.includes('/chat/'))).toHaveLength(1);
});

test('opens continuation with the actual final frame and saves directly to the exact canvas draft',async({page,workspace})=>{
 await configureVideo(workspace);const {projectId,nodeIds}=await seedProject(workspace,'自动最后一帧');await generate(page,workspace,projectId,nodeIds);
 await page.goto('/projects/'+projectId+'/results');await page.getByRole('button',{name:'尾帧续写',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'尾帧续写',exact:true});await expect(dialog.getByAltText('尾帧预览')).toBeVisible();
 const duration=await page.locator('[data-interaction-id="cloud:results:item"] video').evaluate((video:HTMLVideoElement)=>video.duration);
 const time=Number(await dialog.getByLabel('抽取时间（秒）',{exact:true}).inputValue());expect(time).toBeGreaterThan(duration-0.005);expect(time).toBeLessThan(duration);
 await dialog.getByLabel('续写提示词',{exact:true}).fill('延续最后一帧的机位，向前行进');await dialog.getByRole('button',{name:'上传尾帧并保存续写流程',exact:true}).click();
 await expect(page).toHaveURL(new RegExp('/projects/'+projectId+'/canvas\\?node='));
 const graph=await graphOf(workspace,projectId),node=graph.nodes.find(node=>node.title==='尾帧续写视频')!;
 expect(new URL(page.url()).searchParams.get('node')).toBe(node.id);expect(graph.nodes.find(node=>node.title==='尾帧参考')?.data.sourceVideo).toMatchObject({timeSeconds:time});
});

test('keeps a compact video task status permanently visible without an outline or prompt dump',async({page,workspace})=>{
 await configureVideo(workspace);const {projectId,nodeIds}=await seedProject(workspace,'常驻任务栏'),[run]=await generate(page,workspace,projectId,nodeIds);
 await workspace.pool.query("UPDATE workspace_video_runs SET document=jsonb_set(document,'{executionState}','\"running\"') WHERE id=$1",[run.id]);
 await page.goto('/projects/'+projectId+'/canvas');const status=page.getByRole('complementary',{name:'视频生成与任务',exact:true});
 await expect(status).toBeVisible();await expect(status).toContainText('正在生成');await expect(page.getByRole('heading',{name:'节点大纲',exact:true})).toHaveCount(0);
 await expect(status.locator('pre')).toHaveCount(0);await expect(status).not.toContainText('将使用的正文');
 await page.getByRole('button',{name:'恢复布局',exact:true}).click();await expect(status).toBeVisible();
 await page.getByRole('button',{name:'提示词生成面板',exact:true}).click();await expect(status).toBeVisible();
});
test('both result dialogs keep the entered prompt and offer text API settings when no text model is configured',async({page,workspace})=>{
 await configureVideo(workspace);const {projectId,nodeIds}=await seedProject(workspace,'未配置文字模型');await generate(page,workspace,projectId,nodeIds);await page.goto('/projects/'+projectId+'/results');
 for(const action of ['尾帧续写','修改后重新生成']){
  await page.getByRole('button',{name:action,exact:true}).click();const dialog=page.getByRole('dialog',{name:action,exact:true});const prompt=dialog.locator('textarea').first();await prompt.fill('保留未保存的正文');await dialog.getByRole('button',{name:'文字 API 润色',exact:true}).click();
  await expect(dialog.getByRole('alert')).toContainText('配置文字 API');await expect(prompt).toHaveValue('保留未保存的正文');await expect(dialog.getByRole('link',{name:'配置文字 API',exact:true})).toHaveAttribute('href','/settings/connections#text-api');await expect(dialog.getByRole('link',{name:'配置文字 API',exact:true})).toHaveAttribute('target','_blank');await expect(page.locator('.prompt-generator-panel')).toHaveCount(0);await dialog.getByRole('button',{name:'取消',exact:true}).click();
 }
 expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(1);
});
test('plays an automatically placed result and undoes only its lineage without another generation',async({page,workspace})=>{
 await configureVideo(workspace);
 const {projectId,nodeIds}=await seedProject(workspace,'结果审片'),[run]=await generate(page,workspace,projectId,nodeIds);
 await page.goto('/projects/'+projectId+'/results');
 const item=page.locator('[data-interaction-id="cloud:results:item"]');await expect(item).toHaveCount(1);
 await expect(item.locator('video')).toHaveCount(1);await expect(item.getByRole('link',{name:'下载视频',exact:true})).toHaveAttribute('href',new RegExp(run.resultAssetId));
 await item.getByRole('button',{name:'查看任务详情',exact:true}).click();await expect(page.getByRole('dialog',{name:'云端视频任务',exact:true})).toContainText('雨后的街道，一镜到底');await page.keyboard.press('Escape');
 const before=await countOf(workspace,receiptQuery,[projectId]);
 await item.getByRole('button',{name:'选择此结果放入画布',exact:true}).click();await expect(page.getByRole('status').first()).toContainText('此结果已经关联到原画布');
 expect(await countOf(workspace,receiptQuery,[projectId])).toBe(before);
 const selected=await graphOf(workspace,projectId),placed=selected.nodes.find(node=>node.type==='result');
 expect(placed?.data).toMatchObject({assetId:run.resultAssetId,runId:run.id,generationLinked:true});
 expect(selected.edges.filter(edge=>edge.relation==='result')).toHaveLength(1);
 await page.reload();const reloaded=page.locator('[data-interaction-id="cloud:results:item"]');
 await expect(reloaded.getByRole('button',{name:'撤销选择',exact:true})).toBeEnabled();await expect(reloaded).toContainText('已在画布中');
 await reloaded.getByRole('button',{name:'撤销选择',exact:true}).click();await expect(page.getByRole('status').first()).toContainText('已解除生成来源关联');
 const cleared=await graphOf(workspace,projectId);expect(cleared.nodes.filter(node=>node.type==='result')).toHaveLength(1);expect(cleared.edges.filter(edge=>edge.relation==='result')).toHaveLength(0);
 await expect(reloaded.getByRole('button',{name:'撤销选择',exact:true})).toBeDisabled();
 expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(1);
});

test('generated result video preview grows with its node and keeps result actions inside the card',async({page,workspace},testInfo)=>{
 await page.setViewportSize({width:1920,height:1440});await configureVideo(workspace);
 const {projectId,nodeIds}=await seedProject(workspace,'结果画面调整'),[run]=await generate(page,workspace,projectId,nodeIds);
 await page.goto('/projects/'+projectId+'/results');await page.getByRole('button',{name:'选择此结果放入画布',exact:true}).click();await expect(page.getByRole('status').first()).toContainText('此结果已经关联到原画布');
 const h=workspace.headers(workspace.account),snapshot=(await workspace.call('GET','/studio-api/projects/'+projectId+'/workspace',h)).json(),node=snapshot.graph.nodes.find((n:{type:string})=>n.type==='result');expect(node).toBeTruthy();
 expect((await workspace.call('POST','/studio-api/projects/'+projectId+'/commands',{...h,payload:{expectedRevision:snapshot.graph.revision,idempotencyKey:randomUUID(),command:{type:'operations',operations:[{id:randomUUID(),type:'move_node',payload:{nodeId:node.id,x:64,y:64}},{id:randomUUID(),type:'update_node',payload:{nodeId:node.id,patch:{size:{width:480,height:660}}}}],viewport:{x:0,y:0,scale:1}}}})).statusCode).toBe(200);
 await page.goto('/projects/'+projectId+'/canvas');const card=page.locator('[data-node-id="'+node.id+'"]'),video=card.locator('video');await expect.poll(()=>video.evaluate(v=>(v as HTMLVideoElement).videoHeight)).toBeGreaterThan(0);await card.locator('header').click();
 const before=await video.boundingBox(),grip=await card.getByRole('button',{name:'调整节点大小 '+node.title,exact:true}).boundingBox();if(!before||!grip)throw Error('Missing result preview');
 await page.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2);await page.mouse.down();await page.mouse.move(grip.x+grip.width/2+120,grip.y+grip.height/2+160,{steps:8});await page.mouse.up();await expect(page.getByRole('status').first()).toContainText('已保存');
 const after=await video.boundingBox(),frame=await card.locator('.canvas-asset-preview').boundingBox();if(!after||!frame)throw Error('Missing expanded result');
 await page.screenshot({path:testInfo.outputPath('result-video-resized.png'),fullPage:true});await testInfo.attach('result-media-resize',{body:JSON.stringify({before,after,frame}),contentType:'application/json'});
 expect.soft(after.height-before.height,'Result video must grow with the card').toBeGreaterThan(140);expect.soft(Math.abs(frame.height-after.height),'Result video must fill its available frame').toBeLessThanOrEqual(2);await expect(video).toHaveCSS('object-fit','contain');
 expect.soft(await card.locator('.node-body').evaluate(el=>el.scrollHeight-el.clientHeight),'Result controls should fit a large card without hidden overflow').toBeLessThanOrEqual(2);
 await expect(card.getByRole('button',{name:'尾帧续写',exact:true})).toBeVisible();await expect(card.getByRole('button',{name:'修改后重新生成',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(page.getByRole('status').first()).toContainText('已保存');await expect.poll(async()=>Math.abs(((await video.boundingBox())?.height??0)-before.height)).toBeLessThanOrEqual(2);
 await page.getByRole('button',{name:'重做',exact:true}).click();await expect(page.getByRole('status').first()).toContainText('已保存');await page.reload();await expect.poll(async()=>((await video.boundingBox())?.height??0)).toBeGreaterThan(before.height+140);
 const restored=(await workspace.call('GET','/studio-api/projects/'+projectId+'/workspace',h)).json().graph.nodes.find((n:{id:string})=>n.id===node.id);expect(restored.size).toEqual({width:600,height:820});expect(restored.data).toMatchObject({assetId:run.resultAssetId,runId:run.id});expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(1);
});
test('freezes the tail-frame request so a lost response is retried with the identical command and no duplicate node',async({page,workspace})=>{
 await configureVideo(workspace);
 const {projectId,nodeIds}=await seedProject(workspace,'尾帧续写'),[run]=await generate(page,workspace,projectId,nodeIds);
 const assets=await countOf(workspace,assetQuery,[workspace.account.view.user.id]),receipts=await countOf(workspace,receiptQuery,[projectId]);
 const posted:string[]=[];let lose=true;
 await page.route('**/studio-api/projects/'+projectId+'/commands',async route=>{
  const body=route.request().postData()??'';
  if(lose){lose=false;posted.push(body);await workspace.call('POST','/studio-api/projects/'+projectId+'/commands',{...workspace.headers(workspace.account),payload:JSON.parse(body)});await route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({code:'INTERNAL_ERROR'})});return;}
  posted.push(body);await route.fallback();
 });
 await page.goto('/projects/'+projectId+'/results');const item=page.locator('[data-interaction-id="cloud:results:item"]');
 await item.getByRole('button',{name:'尾帧续写',exact:true}).click();const dialog=page.getByRole('dialog',{name:'尾帧续写',exact:true});
 await dialog.locator('[data-interaction-id="cloud:results:tail-frame-time"]').fill('0.2');await dialog.getByRole('button',{name:'抽取并预览尾帧',exact:true}).click();
 await expect(dialog.locator('[data-interaction-id="cloud:results:tail-frame-preview"]')).toBeVisible();
 await dialog.locator('[data-interaction-id="cloud:results:tail-frame-prompt"]').fill('从尾帧继续向前推进');
 await dialog.getByRole('button',{name:'上传尾帧并保存续写流程',exact:true}).click();
 await expect(dialog.getByRole('alert')).toContainText('提交结果未知');await expect(dialog.locator('[data-interaction-id="cloud:results:tail-frame-prompt"]')).toBeDisabled();
 expect(await countOf(workspace,assetQuery,[workspace.account.view.user.id])).toBe(assets+1);
 expect(await countOf(workspace,receiptQuery,[projectId])).toBe(receipts+1);
 await dialog.getByRole('button',{name:'重试保存续写流程',exact:true}).click();await expect(page).toHaveURL(new RegExp('/projects/'+projectId+'/canvas\\?node='));
 expect(posted).toHaveLength(2);expect(posted[0]).toBe(posted[1]);
 expect(await countOf(workspace,receiptQuery,[projectId])).toBe(receipts+1);
 expect(await countOf(workspace,assetQuery,[workspace.account.view.user.id])).toBe(assets+1);
 const graph=await graphOf(workspace,projectId),frame=graph.nodes.find(node=>node.type==='asset'&&node.title==='尾帧参考'),draft=graph.nodes.find(node=>node.type==='video-generation'&&node.title==='尾帧续写视频'),text=graph.nodes.find(node=>node.type==='text'&&node.title==='续写提示词');
 expect(frame?.data.sourceVideo).toMatchObject({sourceAssetId:run.resultAssetId,sourceRunId:run.id});
 expect(text?.data).toMatchObject({kind:'text',text:'从尾帧继续向前推进'});expect(draft).toBeTruthy();
 expect(graph.edges.map(edge=>[edge.port,edge.order,edge.relation??null])).toEqual(expect.arrayContaining([['video',0,'tail-frame'],['image',0,null],['text',1,null]]));
 await page.goto('/projects/'+projectId+'/results');await expect(page.locator('[data-interaction-id="cloud:results:item"]').locator('video')).toHaveCount(1);
 expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(1);
});
test('keeps an uploaded tail frame when reading the new asset fails and reuses it without a new upload',async({page,workspace})=>{
 await configureVideo(workspace);
 const {projectId,nodeIds}=await seedProject(workspace,'尾帧读取失败'),[run]=await generate(page,workspace,projectId,nodeIds);
 const userId=workspace.account.view.user.id,assets=await countOf(workspace,assetQuery,[userId]),receipts=await countOf(workspace,receiptQuery,[projectId]);
 const posted:string[]=[];let failRead=true;
 await page.route('**/studio-api/assets/*',async route=>{
  const url=new URL(route.request().url()),parts=url.pathname.split('/').filter(Boolean);
  if(failRead&&route.request().method()==='GET'&&parts.length===3&&parts[0]==='studio-api'&&parts[1]==='assets'){failRead=false;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'MEDIA_UNAVAILABLE'})});return;}
  await route.fallback();
 });
 await page.route('**/studio-api/projects/'+projectId+'/commands',async route=>{posted.push(route.request().postData()??'');await route.fallback();});
 await page.goto('/projects/'+projectId+'/results');const item=page.locator('[data-interaction-id="cloud:results:item"]');
 await item.getByRole('button',{name:'尾帧续写',exact:true}).click();const dialog=page.getByRole('dialog',{name:'尾帧续写',exact:true});
 await dialog.locator('[data-interaction-id="cloud:results:tail-frame-time"]').fill('0.2');await dialog.getByRole('button',{name:'抽取并预览尾帧',exact:true}).click();
 await expect(dialog.locator('[data-interaction-id="cloud:results:tail-frame-preview"]')).toBeVisible();
 await dialog.locator('[data-interaction-id="cloud:results:tail-frame-prompt"]').fill('读取失败后用同一素材重试');
 await dialog.getByRole('button',{name:'上传尾帧并保存续写流程',exact:true}).click();
 await expect(dialog.getByRole('alert')).toContainText('但读取该素材失败');await expect(dialog.getByRole('alert')).toContainText('尚未提交图操作命令');
 await expect(dialog.locator('[data-interaction-id="cloud:results:tail-frame-preview"]')).toBeVisible();
 await expect(dialog.locator('[data-interaction-id="cloud:results:tail-frame-prompt"]')).toHaveValue('读取失败后用同一素材重试');
 await expect(dialog.locator('[data-interaction-id="cloud:results:tail-frame-prompt"]')).toBeEnabled();
 await expect(dialog.getByRole('button',{name:'上传尾帧并保存续写流程',exact:true})).toBeEnabled();
 expect(await countOf(workspace,assetQuery,[userId])).toBe(assets+1);
 const failedFrame=((await workspace.pool.query("SELECT document FROM workspace_assets WHERE user_id=$1 AND document->>'title' LIKE 'tail-frame-%'",[userId])).rows[0].document) as {id:string};
 expect(posted).toHaveLength(0);expect(await countOf(workspace,receiptQuery,[projectId])).toBe(receipts);
 await dialog.getByRole('button',{name:'上传尾帧并保存续写流程',exact:true}).click();await expect(page).toHaveURL(new RegExp('/projects/'+projectId+'/canvas\\?node='));
 expect(posted).toHaveLength(1);expect(await countOf(workspace,assetQuery,[userId])).toBe(assets+1);expect(await countOf(workspace,receiptQuery,[projectId])).toBe(receipts+1);
 const frames=((await workspace.pool.query("SELECT document FROM workspace_assets WHERE user_id=$1 AND document->>'title' LIKE 'tail-frame-%'",[userId])).rows.map(row=>row.document)) as {id:string}[];
 expect(frames.map(frame=>frame.id)).toEqual([failedFrame.id]);
 const graph=await graphOf(workspace,projectId);
 expect(graph.nodes.filter(node=>node.title==='尾帧参考')).toHaveLength(1);
 expect(graph.nodes.find(node=>node.title==='尾帧参考')?.data.sourceVideo).toMatchObject({assetId:failedFrame.id,sourceAssetId:run.resultAssetId,sourceRunId:run.id});
 expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(1);
});
test('keeps a readable reference, reports a deleted one and reports a committed command whose refresh failed',async({page,workspace})=>{
 await configureVideo(workspace);
 const png=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=8;return canvas.toDataURL('image/png').split(',')[1];});
 await page.goto('/assets');await page.getByLabel('选择素材文件',{exact:true}).setInputFiles({name:'参考图.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
 await page.getByRole('button',{name:'上传到云端',exact:true}).click();await expect(page.getByText('参考图.png',{exact:true})).toBeVisible();
 const reference=(await workspace.pool.query("SELECT document FROM workspace_assets WHERE user_id=$1 AND document->>'title'='参考图.png'",[workspace.account.view.user.id])).rows[0].document as {id:string;bytes:number};
 expect(reference.bytes).toBeGreaterThan(0);
 const {projectId,nodeIds}=await seedProject(workspace,'修改后重新生成',1,reference.id);
 workspace.setVideoReferenceSupport({imageReferences:1,videoReferences:0,assetUploads:true});
 expect(workspace.videoReferenceSupport()).toEqual({imageReferences:1,videoReferences:0,assetUploads:true});
 expect(((await workspace.call('GET','/studio-api/me/video-capability',{...workspace.headers(workspace.account)})).json() as {limits:{imageReferences:number;assetBytes?:number}}).limits).toMatchObject({imageReferences:1,assetBytes:1048576});
 let generated:Awaited<ReturnType<typeof generate>>;
 try{generated=await generate(page,workspace,projectId,nodeIds);}finally{workspace.setVideoReferenceSupport({imageReferences:0,videoReferences:0,assetUploads:false});}
 const [run]=generated;
 expect(run.inputSnapshot.references).toHaveLength(1);expect(run.inputSnapshot.references[0].assetId).toBe(reference.id);
 const item=()=>page.locator('[data-interaction-id="cloud:results:item"]');
 await page.goto('/projects/'+projectId+'/results');
 await item().getByRole('button',{name:'修改后重新生成',exact:true}).click();let dialog=page.getByRole('dialog',{name:'修改后重新生成',exact:true});
 await expect(dialog.locator('[data-interaction-id="cloud:results:revision-references"]')).toContainText('（可读）');
 await dialog.locator('[data-interaction-id="cloud:results:revision-prompt"]').fill('保留参考图的夜晚版本');
 await dialog.getByRole('button',{name:'保存为新的视频草稿',exact:true}).click();await expect(page).toHaveURL(new RegExp('/projects/'+projectId+'/canvas\\?node='));await page.goto('/projects/'+projectId+'/results');
 const kept=await graphOf(workspace,projectId),keptDraft=kept.nodes.filter(node=>node.title==='修改后重新生成')[0];
 expect(kept.edges.filter(edge=>edge.targetId===keptDraft.id&&edge.port==='image')).toHaveLength(1);
 expect(kept.nodes.some(node=>node.title==='参考图')).toBe(true);
 await page.route('**/studio-api/assets/'+reference.id+'/files',async route=>{await route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({code:'NOT_FOUND'})});});
 await page.reload();await item().getByRole('button',{name:'修改后重新生成',exact:true}).click();dialog=page.getByRole('dialog',{name:'修改后重新生成',exact:true});
 await expect(dialog.locator('[data-interaction-id="cloud:results:revision-references"]')).toContainText('（缺失或已删除）');
 let failRefresh=true;
 await page.route('**/studio-api/projects/'+projectId+'/workspace',async route=>{if(failRefresh){failRefresh=false;await route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({code:'INTERNAL_ERROR'})});}else await route.fallback();});
 const receipts=await countOf(workspace,receiptQuery,[projectId]);
 await dialog.locator('[data-interaction-id="cloud:results:revision-prompt"]').fill('参考图已删除后的夜晚版本');
 await dialog.getByRole('button',{name:'保存为新的视频草稿',exact:true}).click();
 await expect(dialog.getByRole('status')).toContainText('命令已提交成功，但重新读取失败');
 await expect(dialog.getByRole('alert')).toContainText('未自动替换');
 expect(await countOf(workspace,receiptQuery,[projectId])).toBe(receipts+1);
 const committed=await graphOf(workspace,projectId),drafts=committed.nodes.filter(node=>node.title==='修改后重新生成');
 expect(drafts).toHaveLength(2);
 expect(committed.edges.filter(edge=>edge.port==='image'&&edge.targetId===drafts[1].id)).toHaveLength(0);
 expect(committed.nodes.some(node=>node.title==='修改提示词'&&node.data.text==='参考图已删除后的夜晚版本')).toBe(true);
 await dialog.getByRole('button',{name:'重新读取结果确认',exact:true}).click();await expect(page).toHaveURL(new RegExp('/projects/'+projectId+'/canvas\\?node='));
 expect(await countOf(workspace,receiptQuery,[projectId])).toBe(receipts+1);
 expect((await graphOf(workspace,projectId)).nodes.filter(node=>node.title==='修改提示词').length).toBe(2);
 expect((await workspace.pool.query('SELECT document FROM workspace_video_runs WHERE id=$1',[run.id])).rows[0].document).toMatchObject({id:run.id,resultAssetId:run.resultAssetId,executionState:'succeeded'});
 expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(2);
});
test('compares two owned cloud results and reports a deleted result asset instead of substituting one',async({page,workspace})=>{
 await configureVideo(workspace);
 const {projectId,nodeIds}=await seedProject(workspace,'两版本比较',2),[first,second]=await generate(page,workspace,projectId,nodeIds);
 await page.goto('/projects/'+projectId+'/results');const items=page.locator('[data-interaction-id="cloud:results:item"]');await expect(items).toHaveCount(2);
 await page.locator('article[data-run-id="'+first.id+'"] [data-interaction-id="cloud:results:compare"]').check();await page.locator('article[data-run-id="'+second.id+'"] [data-interaction-id="cloud:results:compare"]').check();
 await page.getByRole('button',{name:'打开 A/B 比较',exact:true}).click();
 await expect(page.locator('[data-interaction-id="cloud:compare:left"]')).toHaveAttribute('data-run-id',first.id);
 await expect(page.locator('[data-interaction-id="cloud:compare:right"]')).toHaveAttribute('data-run-id',second.id);
 await expect(page.locator('[data-interaction-id="cloud:compare:left"] video')).toHaveCount(1);await expect(page.locator('[data-interaction-id="cloud:compare:right"] video')).toHaveCount(1);
 await expect(page.getByRole('button',{name:'同步播放',exact:true})).toBeEnabled();await page.getByRole('button',{name:'同步播放',exact:true}).click();
 await expect(page.getByRole('status').first()).toContainText('不是帧级同步');await page.getByRole('button',{name:'同步暂停',exact:true}).click();
 await page.getByRole('button',{name:'交换 A/B',exact:true}).click();await expect(page.locator('[data-interaction-id="cloud:compare:left"]')).toHaveAttribute('data-run-id',second.id);
 await page.getByRole('button',{name:'回到起点',exact:true}).click();await expect(page.getByRole('status').first()).toContainText('两侧已回到起点');
 await page.goto('/projects/'+projectId+'/compare?runs='+[first.id,randomUUID()].join(','));
 await expect(page.getByRole('alert').first()).toContainText('不属于当前账号');await expect(page.locator('[data-interaction-id="cloud:compare:left"]')).toHaveCount(0);
 const owner=workspace.account,other=await workspace.signup('Cloud_UI_B');
 workspace.switchAccount(other);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(page.getByTitle('当前账号：Cloud_UI_B',{exact:true})).toBeVisible();
 await page.goto('/projects/'+projectId+'/compare?runs='+[first.id,second.id].join(','));
 await expect(page.getByRole('alert').first()).toContainText('不属于当前账号');await expect(page.locator('[data-interaction-id="cloud:compare:left"]')).toHaveCount(0);
 workspace.switchAccount(owner);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(page.getByTitle('当前账号：Cloud_UI_A',{exact:true})).toBeVisible();
 await page.route('**/studio-api/assets/'+first.resultAssetId+'/files',async route=>{await route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({code:'NOT_FOUND'})});});
 await page.goto('/projects/'+projectId+'/results');
 const lost=page.locator('article[data-run-id="'+first.id+'"]');
 await expect(lost.locator('[data-interaction-id="cloud:asset:media-unavailable"]')).toContainText('不会自动替换为其他文件');
 await expect(lost.locator('video')).toHaveCount(0);
 await expect(page.locator('article[data-run-id="'+second.id+'"]').locator('video')).toHaveCount(1);
 await page.goto('/projects/'+projectId+'/compare?runs='+[first.id,second.id].join(','));
 await expect(page.locator('[data-interaction-id="cloud:compare:left"]').locator('[data-interaction-id="cloud:asset:media-unavailable"]')).toContainText('不会自动替换为其他文件');
 await expect(page.locator('[data-interaction-id="cloud:compare:left"] video')).toHaveCount(0);
 await expect(page.locator('[data-interaction-id="cloud:compare:right"] video')).toHaveCount(1);
 expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(2);
});
test('reaches the results page from existing canvas and task entries with explicit run targeting',async({page,workspace})=>{
 await configureVideo(workspace);
 const {projectId,nodeIds}=await seedProject(workspace,'结果入口'),[run]=await generate(page,workspace,projectId,nodeIds);
 await page.goto('/projects/'+projectId+'/canvas');
 await expect(page.getByRole('complementary',{name:'视频生成与任务',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'查看视频任务',exact:true}).click();
 const detail=page.getByRole('dialog',{name:'云端视频任务',exact:true});
 await detail.getByRole('link',{name:'打开视频结果页',exact:true}).click();
 await expect(page).toHaveURL(new RegExp('/projects/'+projectId+'/results\\?runId='+run.id+'$'));
 const entered=page.locator('article[data-run-id="'+run.id+'"]');
 await expect(entered.locator('[data-interaction-id="cloud:results:highlighted"]')).toContainText('已定位到该结果版本');
 await expect(entered.locator('video')).toHaveCount(1);
 await entered.getByRole('button',{name:'修改后重新生成',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'修改后重新生成',exact:true})).toBeVisible();
 await page.keyboard.press('Escape');
 await page.goto('/tasks');
 await page.getByRole('link',{name:'打开视频结果',exact:true}).click();
 await expect(page).toHaveURL(new RegExp('/projects/'+projectId+'/results\\?runId='+run.id+'$'));
 await expect(page.locator('article[data-run-id="'+run.id+'"] video')).toHaveCount(1);
 expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(1);
});
test('reuses an existing asset node and undoes only the new association',async({page,workspace})=>{
 await configureVideo(workspace);
 const {projectId,nodeIds}=await seedProject(workspace,'复用撤销'),[run]=await generate(page,workspace,projectId,nodeIds);
 // Supplier completion precedes the separate durable canvas insertion transaction.
 // Undo its committed history only after that result is actually present.
 await expect.poll(async()=>(await graphOf(workspace,projectId)).nodes.some(node=>node.type==='result'&&node.data.runId===run.id)).toBe(true);
 const nodeId=randomUUID(),headers=workspace.headers(workspace.account);
 const placed=(await workspace.call('GET','/studio-api/projects/'+projectId+'/workspace',headers)).json();
 expect((await workspace.call('POST','/studio-api/projects/'+projectId+'/commands',{...headers,payload:{expectedRevision:placed.graph.revision,idempotencyKey:randomUUID(),command:{type:'undo'}}})).statusCode).toBe(200);
 const current=(await workspace.call('GET','/studio-api/projects/'+projectId+'/workspace',{...headers})).json() as {graph:{revision:number}};
 expect((await workspace.call('POST','/studio-api/projects/'+projectId+'/commands',{...headers,payload:{expectedRevision:current.graph.revision,idempotencyKey:randomUUID(),command:{type:'operations',operations:[{id:randomUUID(),type:'add_node',payload:{node:{id:nodeId,type:'asset',title:'Existing video',x:100,y:900,locked:false,data:{kind:'asset',assetId:run.resultAssetId}}}}]}}})).statusCode).toBe(200);
 await page.goto('/projects/'+projectId+'/results');
 const item=page.locator('[data-interaction-id="cloud:results:item"]');
 await item.getByRole('button',{name:'选择此结果放入画布',exact:true}).click();
 await expect(page.getByRole('status').first()).toContainText('已复用');
 expect((await graphOf(workspace,projectId)).edges.filter(edge=>edge.targetId===nodeId&&edge.relation==='result')).toHaveLength(1);
 await item.getByRole('button',{name:'撤销选择',exact:true}).click();
 await expect(page.getByRole('status').first()).toContainText('已解除生成来源关联');
 await expect.poll(async()=>(await graphOf(workspace,projectId)).edges.filter(edge=>edge.targetId===nodeId&&edge.relation==='result').length).toBe(0);
 expect(await graphOf(workspace,projectId)).toMatchObject({nodes:expect.arrayContaining([expect.objectContaining({id:nodeId,type:'asset',title:'Existing video',data:expect.objectContaining({assetId:run.resultAssetId,generationLinked:false})})])});
});
test('unknown revision submission survives cancel and refresh with the same key',async({page,workspace})=>{
 await configureVideo(workspace);
 const {projectId,nodeIds}=await seedProject(workspace,'未知恢复'),[run]=await generate(page,workspace,projectId,nodeIds);
 const before=await countOf(workspace,receiptQuery,[projectId]),posted:string[]=[];let lose=true;
 await page.route('**/studio-api/projects/'+projectId+'/commands',async route=>{
  const body=route.request().postData()??'';posted.push(body);
  if(lose){lose=false;expect((await workspace.call('POST','/studio-api/projects/'+projectId+'/commands',{...workspace.headers(workspace.account),payload:JSON.parse(body)})).statusCode).toBe(200);await route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({code:'INTERNAL_ERROR'})});return;}
  await route.fallback();
 });
 await page.goto('/projects/'+projectId+'/results');
 await page.getByRole('button',{name:'修改后重新生成',exact:true}).click();
 let dialog=page.getByRole('dialog',{name:'修改后重新生成',exact:true});
 await dialog.locator('[data-interaction-id="cloud:results:revision-prompt"]').fill('需要恢复的修改');
 await dialog.getByRole('button',{name:'保存为新的视频草稿',exact:true}).click();
 await expect(dialog.getByRole('alert')).toContainText('提交结果未知');
 await dialog.getByRole('button',{name:'取消',exact:true}).click();
 await expect(page.getByRole('status').first()).toContainText('有 1 个提交未确认');
 await page.reload();
 await expect(page.getByRole('status').first()).toContainText('有 1 个提交未确认');
 await page.getByRole('button',{name:'修改后重新生成',exact:true}).click();
 dialog=page.getByRole('dialog',{name:'修改后重新生成',exact:true});
 await expect(dialog.getByRole('status')).toContainText('已恢复此前未确认的请求');
 await dialog.getByRole('button',{name:'重试保存新草稿',exact:true}).click();
 await expect(dialog).toHaveCount(0);
 expect(posted).toHaveLength(2);expect(posted[1]).toBe(posted[0]);
 expect(await countOf(workspace,receiptQuery,[projectId])).toBe(before+1);
 expect((await workspace.pool.query('SELECT document FROM workspace_video_runs WHERE id=$1',[run.id])).rows[0].document).toMatchObject({id:run.id,executionState:'succeeded'});
});
test('unknown tail-frame submission survives cancel and refresh with the same key',async({page,workspace})=>{
 await configureVideo(workspace);
 const {projectId,nodeIds}=await seedProject(workspace,'续写未知恢复');await generate(page,workspace,projectId,nodeIds);
 const userId=workspace.account.view.user.id,assets=await countOf(workspace,assetQuery,[userId]),receipts=await countOf(workspace,receiptQuery,[projectId]);
 const posted:string[]=[];let lose=true;
 await page.route('**/studio-api/projects/'+projectId+'/commands',async route=>{
  const body=route.request().postData()??'';posted.push(body);
  if(lose){lose=false;expect((await workspace.call('POST','/studio-api/projects/'+projectId+'/commands',{...workspace.headers(workspace.account),payload:JSON.parse(body)})).statusCode).toBe(200);await route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({code:'INTERNAL_ERROR'})});return;}
  await route.fallback();
 });
 await page.goto('/projects/'+projectId+'/results');const item=page.locator('[data-interaction-id="cloud:results:item"]');
 await item.getByRole('button',{name:'尾帧续写',exact:true}).click();let dialog=page.getByRole('dialog',{name:'尾帧续写',exact:true});
 await dialog.locator('[data-interaction-id="cloud:results:tail-frame-time"]').fill('0.2');await dialog.getByRole('button',{name:'抽取并预览尾帧',exact:true}).click();
 await expect(dialog.locator('[data-interaction-id="cloud:results:tail-frame-preview"]')).toBeVisible();
 await dialog.locator('[data-interaction-id="cloud:results:tail-frame-prompt"]').fill('未知提交后恢复续写');
 await dialog.getByRole('button',{name:'上传尾帧并保存续写流程',exact:true}).click();
 await expect(dialog.getByRole('alert')).toContainText('提交结果未知');
 await dialog.getByRole('button',{name:'取消',exact:true}).click();
 await expect(page.getByRole('status').first()).toContainText('有 1 个提交未确认');
 await page.reload();
 await item.getByRole('button',{name:'尾帧续写',exact:true}).click();dialog=page.getByRole('dialog',{name:'尾帧续写',exact:true});
 await expect(dialog.getByRole('status')).toContainText('已恢复此前未确认的请求');
 await dialog.getByRole('button',{name:'重试保存续写流程',exact:true}).click();
 await expect(dialog).toHaveCount(0);
 await expect(page).toHaveURL(new RegExp('/projects/'+projectId+'/canvas\\?node='));
 expect(posted).toHaveLength(2);expect(posted[1]).toBe(posted[0]);
 expect(await countOf(workspace,assetQuery,[userId])).toBe(assets+1);expect(await countOf(workspace,receiptQuery,[projectId])).toBe(receipts+1);
 expect((await graphOf(workspace,projectId)).nodes.filter(node=>node.title==='尾帧参考')).toHaveLength(1);
 expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(1);
});


test('restored result card opens exact tail and revision actions and repairs a recorded source without regeneration',async({page,workspace})=>{
 await configureVideo(workspace);
 const {projectId,nodeIds}=await seedProject(workspace,'原结果卡片与来源'),[run]=await generate(page,workspace,projectId,nodeIds);
 await page.goto('/projects/'+projectId+'/results');
 await page.getByRole('button',{name:'选择此结果放入画布',exact:true}).click();await expect(page.getByRole('status').first()).toContainText('此结果已经关联到原画布');
 let snapshot=(await workspace.call('GET','/studio-api/projects/'+projectId+'/workspace',workspace.headers(workspace.account))).json();
 const node=snapshot.graph.nodes.find((value:{type:string;data:{runId?:string}})=>value.type==='result'&&value.data.runId===run.id);
 expect(node).toBeTruthy();
 const edges=snapshot.graph.edges.filter((edge:{targetId:string;relation?:string})=>edge.targetId===node.id&&edge.relation==='result');
 expect((await workspace.call('POST','/studio-api/projects/'+projectId+'/commands',{...workspace.headers(workspace.account),payload:{expectedRevision:snapshot.graph.revision,idempotencyKey:randomUUID(),command:{type:'operations',operations:[...edges.map((edge:{id:string})=>({id:randomUUID(),type:'remove_edge',payload:{edgeId:edge.id}})),{id:randomUUID(),type:'update_node',payload:{nodeId:node.id,patch:{data:{...node.data,generationLinked:false}}}}]}}})).statusCode).toBe(200);
 await page.goto('/projects/'+projectId+'/canvas');
 await page.getByRole('button',{name:'补齐来源连线',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'已补齐'})).toContainText('可撤销');
 snapshot=(await workspace.call('GET','/studio-api/projects/'+projectId+'/workspace',workspace.headers(workspace.account))).json();
 expect(snapshot.graph.edges.filter((edge:{targetId:string;relation?:string})=>edge.targetId===node.id&&edge.relation==='result')).toHaveLength(1);
 await page.getByRole('button',{name:'适配全部',exact:true}).click();
 await page.locator('[data-node-id="'+node.id+'"]').getByRole('button',{name:'尾帧续写',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'尾帧续写',exact:true})).toBeVisible();
 await page.keyboard.press('Escape');
 await page.goto('/projects/'+projectId+'/canvas');await page.getByRole('button',{name:'适配全部',exact:true}).click();
 await page.locator('[data-node-id="'+node.id+'"]').getByRole('button',{name:'修改后重新生成',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'修改后重新生成',exact:true})).toBeVisible();
 expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(1);
});
