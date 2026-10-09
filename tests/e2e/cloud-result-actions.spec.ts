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
  await page.getByLabel('本次视频草稿',{exact:true}).selectOption(nodeId);
  await page.getByRole('button',{name:'生成视频',exact:true}).click();
  await page.getByLabel('我确认所列视频生成可能收费',{exact:true}).check();
  await page.getByRole('button',{name:'确认生成',exact:true}).click();
 }
 await expect.poll(async()=>(await ctx.pool.query("SELECT count(*)::int n FROM workspace_video_runs WHERE project_id=$1 AND document->>'executionState'='succeeded'",[projectId])).rows[0].n).toBe(nodeIds.length);
 return (await ctx.pool.query('SELECT document FROM workspace_video_runs WHERE project_id=$1 ORDER BY created_at',[projectId])).rows.map(row=>row.document as {id:string;resultAssetId:string;inputSnapshot:{references:{alias:string;assetId:string}[]}});
}
test('plays, downloads, selects and undoes a historical cloud result without another generation',async({page,workspace})=>{
 await configureVideo(workspace);
 const {projectId,nodeIds}=await seedProject(workspace,'结果审片'),[run]=await generate(page,workspace,projectId,nodeIds);
 await page.goto('/projects/'+projectId+'/results');
 const item=page.locator('[data-interaction-id="cloud:results:item"]');await expect(item).toHaveCount(1);
 await expect(item.locator('video')).toHaveCount(1);await expect(item.getByRole('link',{name:'下载视频',exact:true})).toHaveAttribute('href',new RegExp(run.resultAssetId));
 await item.getByRole('button',{name:'查看任务详情',exact:true}).click();await expect(page.getByRole('dialog',{name:'云端视频任务',exact:true})).toContainText('雨后的街道，一镜到底');await page.keyboard.press('Escape');
 const before=await countOf(workspace,receiptQuery,[projectId]);
 await item.getByRole('button',{name:'选择此结果放入画布',exact:true}).click();await expect(page.getByRole('status').first()).toContainText('结果已放入画布');
 expect(await countOf(workspace,receiptQuery,[projectId])).toBe(before+1);
 const selected=await graphOf(workspace,projectId),placed=selected.nodes.find(node=>node.type==='result');
 expect(placed?.data).toMatchObject({assetId:run.resultAssetId,runId:run.id,generationLinked:true});
 expect(selected.edges.filter(edge=>edge.relation==='result')).toHaveLength(1);
 await page.reload();const reloaded=page.locator('[data-interaction-id="cloud:results:item"]');
 await expect(reloaded.getByRole('button',{name:'撤销选择',exact:true})).toBeEnabled();await expect(reloaded).toContainText('已在画布中');
 await reloaded.getByRole('button',{name:'撤销选择',exact:true}).click();await expect(page.getByRole('status').first()).toContainText('已移除本次放入的结果节点');
 const cleared=await graphOf(workspace,projectId);expect(cleared.nodes.filter(node=>node.type==='result')).toHaveLength(0);expect(cleared.edges.filter(edge=>edge.relation==='result')).toHaveLength(0);
 await expect(reloaded.getByRole('button',{name:'撤销选择',exact:true})).toBeDisabled();
 expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(1);
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
 await dialog.getByRole('button',{name:'重试保存续写流程',exact:true}).click();await expect(page.getByRole('status').first()).toContainText('尾帧续写已保存为一个命令批次');
 expect(posted).toHaveLength(2);expect(posted[0]).toBe(posted[1]);
 expect(await countOf(workspace,receiptQuery,[projectId])).toBe(receipts+1);
 expect(await countOf(workspace,assetQuery,[workspace.account.view.user.id])).toBe(assets+1);
 const graph=await graphOf(workspace,projectId),frame=graph.nodes.find(node=>node.type==='asset'&&node.title==='尾帧参考'),draft=graph.nodes.find(node=>node.type==='video-generation'&&node.title==='尾帧续写视频'),text=graph.nodes.find(node=>node.type==='text'&&node.title==='续写提示词');
 expect(frame?.data.sourceVideo).toMatchObject({sourceAssetId:run.resultAssetId,sourceRunId:run.id});
 expect(text?.data).toMatchObject({kind:'text',text:'从尾帧继续向前推进'});expect(draft).toBeTruthy();
 expect(graph.edges.map(edge=>[edge.port,edge.order,edge.relation??null])).toEqual(expect.arrayContaining([['video',0,'tail-frame'],['image',0,null],['text',1,null]]));
 await page.reload();await expect(page.locator('[data-interaction-id="cloud:results:item"]').locator('video')).toHaveCount(1);
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
 await dialog.getByRole('button',{name:'上传尾帧并保存续写流程',exact:true}).click();await expect(page.getByRole('status').first()).toContainText('尾帧续写已保存为一个命令批次');
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
 await dialog.getByRole('button',{name:'保存为新的视频草稿',exact:true}).click();await expect(page.getByRole('status').first()).toContainText('已创建修改后的视频草稿');
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
 await dialog.getByRole('button',{name:'重新读取结果确认',exact:true}).click();await expect(page.getByRole('status').first()).toContainText('此前的请求其实已保存');
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
 await expect(page.getByText('当前账号：Cloud_UI_B',{exact:true})).toBeVisible();
 await page.goto('/projects/'+projectId+'/compare?runs='+[first.id,second.id].join(','));
 await expect(page.getByRole('alert').first()).toContainText('不属于当前账号');await expect(page.locator('[data-interaction-id="cloud:compare:left"]')).toHaveCount(0);
 workspace.switchAccount(owner);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(page.getByText('当前账号：Cloud_UI_A',{exact:true})).toBeVisible();
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
