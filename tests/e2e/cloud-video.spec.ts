import {randomUUID} from 'node:crypto';
import {test,expect} from '../helpers/cloud-workspace-ui-fixture';
import type {fixture,Account} from '../../server/tests/account-fixture';
import type {CloudVideoPreview} from '../../src/domain/cloud-video-run';
async function latestPreview(workspace:Awaited<ReturnType<typeof fixture>>,projectId:string){return (await workspace.pool.query("SELECT document FROM workspace_video_previews WHERE project_id=$1 ORDER BY (document->>'expiresAt')::bigint DESC LIMIT 1",[projectId])).rows[0].document as CloudVideoPreview;}
async function savedProject(workspace:Awaited<ReturnType<typeof fixture>>&{account:Account}){
 const h=workspace.headers(workspace.account);expect((await workspace.call('PATCH','/studio-api/me/model-configs/video',{...h,payload:{apiBase:'https://video.example.test',model:'seedance',apiKey:'FAKE_VIDEO_UI_KEY',expectedRevision:null}})).statusCode).toBe(200);
 const project=(await workspace.call('POST','/studio-api/projects',{...h,payload:{title:'失败与取消检查'}})).json(),textId=randomUUID(),nodeId=randomUUID();expect((await workspace.call('POST','/studio-api/projects/'+project.id+'/commands',{...h,payload:{expectedRevision:0,idempotencyKey:randomUUID(),command:{type:'operations',operations:[{id:randomUUID(),type:'add_node',payload:{node:{id:textId,type:'text',title:'创意',x:40,y:40,locked:false,data:{kind:'text',text:'安全转换的输入',referenceTokens:[]}}}},{id:randomUUID(),type:'add_node',payload:{node:{id:nodeId,type:'video-generation',title:'视频草稿',x:440,y:40,locked:false,data:{kind:'video-generation',draft:{modelId:'seedance',durationSeconds:5,ratio:'16:9',resolution:'480p'},inputBindings:[],stale:true}}}},{id:randomUUID(),type:'add_edge',payload:{edge:{id:randomUUID(),sourceId:textId,targetId:nodeId,port:'text',order:0}}}]}}})).statusCode).toBe(200);return project;
}
test('compact generation confirmation submits only on confirm and result actions use prominent primary buttons',async({page,workspace},testInfo)=>{
 const project=await savedProject(workspace);await page.goto('/projects/'+project.id+'/canvas');
 const generate=page.locator('[data-interaction-id="V-08"]'),color=await generate.evaluate(button=>getComputedStyle(button).backgroundColor);
 await generate.click();const dialog=page.getByRole('dialog',{name:'确认云端视频生成',exact:true});await expect(dialog).toBeVisible();
 await expect(dialog.getByRole('checkbox')).toHaveCount(0);await expect(dialog.locator('pre,article,select')).toHaveCount(0);
 await expect(dialog.locator('.dialog-body')).toContainText('是否确认生成视频');
 await expect(dialog.locator('.dialog-footer button')).toHaveText(['取消','确认']);
 await page.screenshot({path:testInfo.outputPath('compact-confirmation.png')});
 expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(0);
 await dialog.getByRole('button',{name:'取消',exact:true}).click();expect((await workspace.pool.query('SELECT count(*)::int n FROM workspace_video_runs')).rows[0].n).toBe(0);
 await generate.click();await dialog.getByRole('button',{name:'确认',exact:true}).click();await expect(dialog).not.toBeVisible();
 await expect(page.locator('.node-result')).toHaveCount(1,{timeout:15000});
 for(const name of ['尾帧续写','修改后重新生成']){
  const button=page.locator('.node-result').getByRole('button',{name,exact:true});
  await expect(button).toHaveCSS('background-color',color);await expect(button).toHaveCSS('min-height','44px');
  expect(await button.evaluate(element=>parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(14);
 }
 await page.getByRole('button',{name:'适配全部',exact:true}).click();await page.screenshot({path:testInfo.outputPath('prominent-result-actions.png')});
 expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(1);
});

test('refreshes an expired confirmation only when confirmed and preserves its exact input',async({page,workspace})=>{
 await page.clock.install();
 const project=await savedProject(workspace);await page.goto('/projects/'+project.id+'/canvas');
 await page.locator('[data-interaction-id="V-08"]').click();
 const dialog=page.getByRole('dialog',{name:'确认云端视频生成',exact:true});await expect(dialog).toBeVisible();
 const original=await latestPreview(workspace,project.id);
 await page.clock.fastForward(121000);
 expect((await workspace.pool.query('SELECT count(*)::int n FROM workspace_video_runs')).rows[0].n).toBe(0);
 expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(0);
 await dialog.getByRole('button',{name:'确认',exact:true}).click();await expect(dialog).not.toBeVisible();
 const refreshed=await latestPreview(workspace,project.id);expect(refreshed.id).not.toBe(original.id);expect(refreshed.nodes).toEqual(original.nodes);
 expect((await workspace.pool.query('SELECT count(*)::int n FROM workspace_video_runs')).rows[0].n).toBe(1);
});

test('refreshes a confirmation invalidated by a pending viewport save without changing its target',async({page,workspace})=>{
 const project=await savedProject(workspace);await page.goto('/projects/'+project.id+'/canvas');
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});let received=false;
 await page.route('**/studio-api/projects/*/video-run-preview',async route=>{
  const response=await workspace.call('POST',new URL(route.request().url()).pathname,{...workspace.headers(workspace.account),payload:route.request().postDataJSON()});
  received=true;await gate;await route.fulfill({status:response.statusCode,contentType:'application/json',body:JSON.stringify(response.json())});
 });
 try{
  await page.locator('[data-interaction-id="V-08"]').click();await expect.poll(()=>received).toBe(true);
  const original=await latestPreview(workspace,project.id);
  await page.getByRole('button',{name:'放大',exact:true}).click();
  await expect.poll(async()=>(await workspace.call('GET','/studio-api/projects/'+project.id+'/workspace',workspace.headers(workspace.account))).json().graph.revision).toBe(2);
  release();const dialog=page.getByRole('dialog',{name:'确认云端视频生成',exact:true});await expect(dialog).toBeVisible();
  expect((await workspace.pool.query('SELECT count(*)::int n FROM workspace_video_runs')).rows[0].n).toBe(0);
  expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(0);
  await dialog.getByRole('button',{name:'确认',exact:true}).click();await expect(dialog).not.toBeVisible();
  const refreshed=await latestPreview(workspace,project.id);expect(refreshed.graphRevision).toBe(2);expect(refreshed.nodes).toEqual(original.nodes);
  expect((await workspace.pool.query('SELECT count(*)::int n FROM workspace_video_runs')).rows[0].n).toBe(1);
 }finally{release();}
});

test('retries the same approval after a lost confirmation response even when its displayed expiry has passed',async({page,workspace})=>{
 await page.clock.install();const project=await savedProject(workspace);await page.goto('/projects/'+project.id+'/canvas');
 await page.locator('[data-interaction-id="V-08"]').click();const dialog=page.getByRole('dialog',{name:'确认云端视频生成',exact:true});

 const attempts:{approvalId:string}[]=[];let lose=true;
 await page.route('**/studio-api/projects/*/video-runs',async route=>{
  attempts.push(route.request().postDataJSON());
  if(!lose){await route.fallback();return;}
  lose=false;const response=await workspace.call('POST',new URL(route.request().url()).pathname,{...workspace.headers(workspace.account),payload:route.request().postDataJSON()});
  expect(response.statusCode).toBe(202);await route.abort('failed');
 });
 await dialog.getByRole('button',{name:'确认',exact:true}).click();
 await expect(dialog.getByRole('alert')).toBeVisible();await page.clock.fastForward(121000);
 await expect(dialog.getByRole('button',{name:'确认',exact:true})).toBeEnabled();
 await expect(dialog.getByRole('button',{name:'重新预览',exact:true})).not.toBeVisible();
 await dialog.getByRole('button',{name:'确认',exact:true}).click();await expect(dialog).not.toBeVisible();
 expect(attempts).toHaveLength(2);expect(attempts[1].approvalId).toBe(attempts[0].approvalId);
 expect((await workspace.pool.query('SELECT count(*)::int n FROM workspace_video_runs')).rows[0].n).toBe(1);
 await expect.poll(()=>workspace.providerCalls.filter(call=>call.method==='POST').length).toBe(1);
});

test('previews exact owned cloud video inputs, confirms once, saves the private result and inserts durable lineage',async({page,workspace})=>{
 const h=workspace.headers(workspace.account);await workspace.call('PATCH','/studio-api/me/model-configs/video',{...h,payload:{apiBase:'https://video.example.test',model:'seedance',apiKey:'FAKE_VIDEO_UI_KEY',expectedRevision:null}});
 const project=(await workspace.call('POST','/studio-api/projects',{...h,payload:{title:'云端视频流程'}})).json(),textId=randomUUID(),nodeId=randomUUID();await workspace.call('POST','/studio-api/projects/'+project.id+'/commands',{...h,payload:{expectedRevision:0,idempotencyKey:randomUUID(),command:{type:'operations',operations:[{id:randomUUID(),type:'add_node',payload:{node:{id:textId,type:'text',title:'创意',x:40,y:40,locked:false,data:{kind:'text',text:'雨后街道',referenceTokens:[]}}}},{id:randomUUID(),type:'add_node',payload:{node:{id:nodeId,type:'video-generation',title:'视频草稿',x:440,y:40,locked:false,data:{kind:'video-generation',draft:{modelId:'seedance',durationSeconds:5,ratio:'16:9',resolution:'480p'},inputBindings:[],stale:true}}}},{id:randomUUID(),type:'add_edge',payload:{edge:{id:randomUUID(),sourceId:textId,targetId:nodeId,port:'text',order:0}}}]}}});
 await page.goto('/projects/'+project.id+'/canvas');await page.locator('[data-interaction-id="V-08"]').click();const preview=page.getByRole('dialog',{name:'确认云端视频生成',exact:true});await expect(preview).toBeVisible();expect((await latestPreview(workspace,project.id)).nodes[0].inputSnapshot).toMatchObject({prompt:'雨后街道',spec:{durationSeconds:5}});expect(workspace.providerCalls.filter(call=>!((call.method??'GET')==='GET'&&['/healthz','/v1/models'].includes(new URL(call.url).pathname)))).toHaveLength(0);await expect(page.getByRole('button',{name:'确认',exact:true})).toBeEnabled();await page.getByRole('button',{name:'确认',exact:true}).click();await expect(page.getByRole('button',{name:'查看视频任务',exact:true})).toBeVisible();
 await page.reload();await expect.poll(async()=>(await workspace.pool.query("SELECT document->>'deliveryState' state FROM workspace_video_runs")).rows[0]?.state,{timeout:15000}).toBe('available_for_preview');await expect(page.getByRole('complementary',{name:'视频生成与任务',exact:true})).toBeVisible();await page.getByRole('button',{name:'查看视频任务',exact:true}).click();const detail=page.getByRole('dialog',{name:'云端视频任务',exact:true});await expect(detail).toContainText('生成已完成');await expect(page.locator('.node-result')).toHaveCount(1);await detail.getByRole('button',{name:'关闭云端视频任务',exact:true}).click();await page.reload();await expect(page.locator('.node-result')).toHaveCount(1);expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(1);expect(workspace.providerCalls.every(call=>call.apiKey==='FAKE_VIDEO_UI_KEY')).toBe(true);await page.screenshot({path:'work/account-api-cloud/cloud-video-result.png',fullPage:true});
 await page.getByRole('link',{name:'任务',exact:true}).click();await page.getByRole('button',{name:'查看任务详情',exact:true}).click();await expect(page).toHaveURL(new RegExp('/projects/'+project.id+'/canvas\\?node='+nodeId));await expect(page.getByLabel('节点文本',{exact:true})).toHaveValue('雨后街道');
});
test('keeps the safe 3003 reason and pending billing in both cloud task views after refresh',async({page,workspace})=>{
 workspace.setVideoOutcome('failed');const project=await savedProject(workspace);await page.goto('/projects/'+project.id+'/canvas');await page.locator('[data-interaction-id="V-08"]').click();await page.getByRole('button',{name:'确认',exact:true}).click();await expect.poll(async()=>(await workspace.pool.query("SELECT document->>'executionState' state FROM workspace_video_runs")).rows[0]?.state).toBe('failed_confirmed');await page.reload();await expect(page.getByRole('complementary',{name:'视频生成与任务',exact:true})).toBeVisible();await page.getByRole('button',{name:'查看视频任务',exact:true}).click();const detail=page.getByRole('dialog',{name:'云端视频任务',exact:true});for(const text of ['生成失败：上游判定参考图片可能包含真人，拒绝生成。','错误码：3003。','积分仍在核对，尚未确认最终扣费。'])await expect(detail).toContainText(text);await expect(detail).not.toContainText('FAKE_PRIVATE');await expect(detail).not.toContainText('input image');await page.getByRole('button',{name:'暂停原任务查询',exact:true}).click();await expect(detail).toContainText('原任务查询已暂停');await detail.getByRole('button',{name:'关闭云端视频任务',exact:true}).click();await page.getByRole('link',{name:'任务',exact:true}).click();await page.getByRole('button',{name:'查看任务详情',exact:true}).click();await expect(page).toHaveURL(new RegExp('/projects/'+project.id+'/canvas\\?node='));await page.getByRole('button',{name:'查看视频任务',exact:true}).click();await expect(page.getByRole('dialog',{name:'云端视频任务',exact:true})).toContainText('生成失败：上游判定参考图片可能包含真人，拒绝生成。');expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(1);
});
test('canceling a video preview sends no provider request and does not create a run',async({page,workspace})=>{
 const project=await savedProject(workspace);await page.goto('/projects/'+project.id+'/canvas');await page.locator('[data-interaction-id="V-08"]').click();await page.getByRole('dialog',{name:'确认云端视频生成',exact:true}).getByRole('button',{name:'取消',exact:true}).click();expect(workspace.providerCalls.filter(call=>!((call.method??'GET')==='GET'&&['/healthz','/v1/models'].includes(new URL(call.url).pathname)))).toHaveLength(0);expect((await workspace.pool.query('SELECT count(*)::int n FROM workspace_video_runs')).rows[0].n).toBe(0);
});

test('keeps the video sidebar for task status and leaves generation settings on canvas nodes',async({page,workspace})=>{
 const project=await savedProject(workspace);await page.goto('/projects/'+project.id+'/canvas');
 const side=page.getByRole('complementary',{name:'视频生成与任务',exact:true});await expect(side).toBeVisible();
 await expect(page.locator('[data-interaction-id="V-08"]')).toBeEnabled();
 await expect(side.getByRole('combobox')).toHaveCount(0);await expect(side.getByRole('button',{name:'生成视频',exact:true})).toHaveCount(0);
 await expect(side.getByText('生成设置',{exact:true})).toHaveCount(0);
 await expect(side.getByLabel('本项目视频任务',{exact:true})).toContainText('尚无已确认的视频任务');
 expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(0);
});

test('hides task status to free canvas space without disabling node generation and restores the latest task',async({page,workspace})=>{
 const project=await savedProject(workspace);await page.goto('/projects/'+project.id+'/canvas');
 const side=page.locator('.canvas-side');await expect(side).toBeVisible();
 const before=(await page.locator('.canvas-stage').boundingBox())!.width;
 await page.getByRole('button',{name:'隐藏视频任务',exact:true}).click();await expect(side).toBeHidden();
 expect((await page.locator('.canvas-stage').boundingBox())!.width).toBeGreaterThan(before+300);
 const show=page.getByRole('button',{name:'显示视频任务',exact:true});await expect(show).toHaveAttribute('aria-expanded','false');
 await page.locator('[data-interaction-id="V-08"]').click();
 const dialog=page.getByRole('dialog',{name:'确认云端视频生成',exact:true});await expect(dialog).toBeVisible();
 await dialog.getByRole('button',{name:'确认',exact:true}).click();await expect(dialog).not.toBeVisible();
 await expect.poll(async()=>(await workspace.pool.query("SELECT document->>'executionState' state FROM workspace_video_runs")).rows[0]?.state,{timeout:15000}).toBe('succeeded');
 await expect(side).toBeHidden();await show.click();await expect(side).toBeVisible();await expect(side.getByLabel('本项目视频任务',{exact:true})).toContainText('生成已完成');
 await side.getByRole('button',{name:'查看视频任务',exact:true}).click();const detail=page.getByRole('dialog',{name:'云端视频任务',exact:true});await expect(detail).toContainText('生成已完成');await detail.getByRole('button',{name:'关闭云端视频任务',exact:true}).click();
 await page.getByRole('button',{name:'隐藏视频任务',exact:true}).click();await page.getByRole('button',{name:'恢复布局',exact:true}).click();await expect(side).toBeVisible();
 expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(1);
});
test('builds text, draft and connection purely through the canvas UI before generating',async({page,workspace})=>{
 const h=workspace.headers(workspace.account);
 expect((await workspace.call('PATCH','/studio-api/me/model-configs/video',{...h,payload:{apiBase:'https://video.example.test',model:'seedance',apiKey:'FAKE_VIDEO_UI_KEY',expectedRevision:null}})).statusCode).toBe(200);
 const project=(await workspace.call('POST','/studio-api/projects',{...h,payload:{title:'纯界面建流程'}})).json();
 await page.goto('/projects/'+project.id+'/canvas');
 // 空画布先提示缺正文，生成入口不可用或被阻断
 await page.getByRole('button',{name:'添加文字节点',exact:true}).click();
 await page.locator('[data-interaction-id="cloud:canvas:node-text"]').first().fill('纯界面雨后街道');
 await page.getByRole('button',{name:'添加节点',exact:true}).click();
 await page.locator('[data-interaction-id="cloud:canvas:dialog-model"]').fill('seedance');
 await page.getByRole('button',{name:'添加视频草稿',exact:true}).click();
 // 原视频卡片明确选择上游文字节点。
 await page.getByRole('button',{name:'输出文本',exact:true}).press('Enter');
 await page.getByRole('button',{name:'接收文本',exact:true}).click();
 await page.getByRole('button',{name:'保存到云端',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('已保存');
 await page.locator('[data-interaction-id="V-08"]').click();
 const preview=page.getByRole('dialog',{name:'确认云端视频生成',exact:true});
 await expect(preview).toBeVisible();expect((await latestPreview(workspace,project.id)).nodes[0].inputSnapshot.prompt).toContain('纯界面雨后街道');
 expect(workspace.providerCalls.filter(call=>!((call.method??'GET')==='GET'&&['/healthz','/v1/models'].includes(new URL(call.url).pathname)))).toHaveLength(0);

 await page.getByRole('button',{name:'确认',exact:true}).click();
 await expect(page.getByRole('button',{name:'查看视频任务',exact:true})).toBeVisible();
 expect((await workspace.pool.query('SELECT count(*)::int n FROM workspace_video_runs')).rows[0].n).toBe(1);
 // 单次确认只创建一份任务：对话框关闭且任务唯一（重复确认的并发场景另见下文专测）
 await expect(page.getByRole('dialog',{name:'确认云端视频生成',exact:true})).not.toBeVisible();
});
test('blocks local preview when the text is missing and recovers after补接 without an upstream POST',async({page,workspace})=>{
 const h=workspace.headers(workspace.account);
 expect((await workspace.call('PATCH','/studio-api/me/model-configs/video',{...h,payload:{apiBase:'https://video.example.test',model:'seedance',apiKey:'FAKE_VIDEO_UI_KEY',expectedRevision:null}})).statusCode).toBe(200);
 const project=(await workspace.call('POST','/studio-api/projects',{...h,payload:{title:'缺正文定位'}})).json();
 const nodeId=randomUUID();
 await workspace.call('POST','/studio-api/projects/'+project.id+'/commands',{...h,payload:{expectedRevision:0,idempotencyKey:randomUUID(),command:{type:'operations',operations:[{id:randomUUID(),type:'add_node',payload:{node:{id:nodeId,type:'video-generation',title:'空草稿',x:440,y:40,locked:false,data:{kind:'video-generation',draft:{modelId:'seedance',durationSeconds:5,ratio:'16:9',resolution:'480p'},inputBindings:[],stale:true}}}}]}}});
 await page.goto('/projects/'+project.id+'/canvas');
 await expect(page.locator('.node-video-generation')).toHaveCount(1);
 await page.locator('[data-interaction-id="V-08"]').click();
 await expect(page.locator('.banner.error')).toContainText('以下视频草稿缺少明确连接的提示词正文：空草稿');
 expect(workspace.providerCalls.filter(call=>!((call.method??'GET')==='GET'&&['/healthz','/v1/models'].includes(new URL(call.url).pathname)))).toHaveLength(0);
 // 在画布添加文字并明确连接，不依赖已删除的侧栏生成设置。
 await page.getByRole('button',{name:'添加文字节点',exact:true}).click();
 await page.locator('[data-interaction-id="cloud:canvas:node-text"]').fill('补接后的正文');
 await page.getByRole('button',{name:'输出文本',exact:true}).press('Enter');
 await page.getByRole('button',{name:'接收文本',exact:true}).click();
 await page.getByRole('button',{name:'保存到云端',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('已保存');
 await page.locator('[data-interaction-id="V-08"]').click();
 await expect(page.getByRole('dialog',{name:'确认云端视频生成',exact:true})).toBeVisible();expect((await latestPreview(workspace,project.id)).nodes[0].inputSnapshot.prompt).toContain('补接后的正文');
 expect(workspace.providerCalls.filter(call=>!((call.method??'GET')==='GET'&&['/healthz','/v1/models'].includes(new URL(call.url).pathname)))).toHaveLength(0);
});
test('lists each missing target for multiple videos and never mixes their inputs',async({page,workspace})=>{
 const h=workspace.headers(workspace.account);
 expect((await workspace.call('PATCH','/studio-api/me/model-configs/video',{...h,payload:{apiBase:'https://video.example.test',model:'seedance',apiKey:'FAKE_VIDEO_UI_KEY',expectedRevision:null}})).statusCode).toBe(200);
 const project=(await workspace.call('POST','/studio-api/projects',{...h,payload:{title:'多目标缺失定位'}})).json();
 const t1=randomUUID(),v1=randomUUID(),v2=randomUUID(),spec={modelId:'seedance',durationSeconds:5,ratio:'16:9',resolution:'480p'};
 await workspace.call('POST','/studio-api/projects/'+project.id+'/commands',{...h,payload:{expectedRevision:0,idempotencyKey:randomUUID(),command:{type:'operations',operations:[
  {id:randomUUID(),type:'add_node',payload:{node:{id:t1,type:'text',title:'共享文字',x:40,y:40,locked:false,data:{kind:'text',text:'只连视频一',referenceTokens:[]}}}},
  {id:randomUUID(),type:'add_node',payload:{node:{id:v1,type:'video-generation',title:'视频一',x:440,y:40,locked:false,data:{kind:'video-generation',draft:spec,inputBindings:[],stale:true}}}},
  {id:randomUUID(),type:'add_node',payload:{node:{id:v2,type:'video-generation',title:'视频二',x:440,y:400,locked:false,data:{kind:'video-generation',draft:spec,inputBindings:[],stale:true}}}},
  {id:randomUUID(),type:'add_edge',payload:{edge:{id:randomUUID(),sourceId:t1,targetId:v1,port:'text',order:0}}},
 ]}}});
 await page.goto('/projects/'+project.id+'/canvas');
 // 选中两个视频：缺失项逐一列出，不悄悄用旁边文字
 await page.locator('.canvas-stage').focus();await page.keyboard.press('Control+a');
 await page.getByRole('button',{name:'生成选中视频',exact:true}).click();
 const summary=page.locator('.banner.error');await expect(summary).toContainText('以下视频草稿缺少明确连接的提示词正文');
 await expect(summary).toContainText('视频二');
 await expect(summary).not.toContainText('视频一');
 expect(workspace.providerCalls.filter(call=>!((call.method??'GET')==='GET'&&['/healthz','/v1/models'].includes(new URL(call.url).pathname)))).toHaveLength(0);
 await expect(page.getByRole('dialog',{name:'确认云端视频生成',exact:true})).not.toBeVisible();
 expect((await workspace.pool.query('SELECT count(*)::int n FROM workspace_video_runs')).rows[0].n).toBe(0);
});
test('keeps unsaved canvas edits from reaching preview and sends no upstream POST',async({page,workspace})=>{
 const h=workspace.headers(workspace.account);
 expect((await workspace.call('PATCH','/studio-api/me/model-configs/video',{...h,payload:{apiBase:'https://video.example.test',model:'seedance',apiKey:'FAKE_VIDEO_UI_KEY',expectedRevision:null}})).statusCode).toBe(200);
 const project=(await workspace.call('POST','/studio-api/projects',{...h,payload:{title:'未保存不生成'}})).json();
 const t1=randomUUID(),v1=randomUUID(),spec={modelId:'seedance',durationSeconds:5,ratio:'16:9',resolution:'480p'};
 await workspace.call('POST','/studio-api/projects/'+project.id+'/commands',{...h,payload:{expectedRevision:0,idempotencyKey:randomUUID(),command:{type:'operations',operations:[
  {id:randomUUID(),type:'add_node',payload:{node:{id:t1,type:'text',title:'创意',x:40,y:40,locked:false,data:{kind:'text',text:'已保存正文',referenceTokens:[]}}}},
  {id:randomUUID(),type:'add_node',payload:{node:{id:v1,type:'video-generation',title:'视频草稿',x:440,y:40,locked:false,data:{kind:'video-generation',draft:spec,inputBindings:[],stale:true}}}},
  {id:randomUUID(),type:'add_edge',payload:{edge:{id:randomUUID(),sourceId:t1,targetId:v1,port:'text',order:0}}},
 ]}}});
 await page.goto('/projects/'+project.id+'/canvas');
 await page.locator('[data-interaction-id="cloud:canvas:node-text"]').first().fill('未保存的新正文');
 await expect(page.getByRole('status')).toContainText('未保存');
 // 原卡片入口先保存再预检：保存失败保留输入，不能创建确认单或上游任务。
 await page.route('**/studio-api/projects/*/commands',route=>route.fulfill({status:500,body:'{}'}));
 await page.locator('[data-interaction-id="V-08"]').click();
 await expect(page.getByRole('status')).toContainText('保存未完成');
 await expect(page.getByRole('dialog',{name:'确认云端视频生成',exact:true})).not.toBeVisible();
 await expect(page.locator('[data-interaction-id="cloud:canvas:node-text"]').first()).toHaveValue('未保存的新正文');
 expect(workspace.providerCalls.filter(call=>!((call.method??'GET')==='GET'&&['/healthz','/v1/models'].includes(new URL(call.url).pathname)))).toHaveLength(0);
 expect((await workspace.pool.query('SELECT count(*)::int n FROM workspace_video_runs')).rows[0].n).toBe(0);
});
test('retains editor text after a cloud save conflict and recovers the latest revision on reload',async({page,workspace})=>{
 const h=workspace.headers(workspace.account);
 expect((await workspace.call('PATCH','/studio-api/me/model-configs/video',{...h,payload:{apiBase:'https://video.example.test',model:'seedance',apiKey:'FAKE_VIDEO_UI_KEY',expectedRevision:null}})).statusCode).toBe(200);
 const project=(await workspace.call('POST','/studio-api/projects',{...h,payload:{title:'保存冲突保留正文'}})).json();
 const t1=randomUUID(),v1=randomUUID(),spec={modelId:'seedance',durationSeconds:5,ratio:'16:9',resolution:'480p'};
 await workspace.call('POST','/studio-api/projects/'+project.id+'/commands',{...h,payload:{expectedRevision:0,idempotencyKey:randomUUID(),command:{type:'operations',operations:[
  {id:randomUUID(),type:'add_node',payload:{node:{id:t1,type:'text',title:'创意',x:40,y:40,locked:false,data:{kind:'text',text:'已保存正文',referenceTokens:[]}}}},
  {id:randomUUID(),type:'add_node',payload:{node:{id:v1,type:'video-generation',title:'视频草稿',x:440,y:40,locked:false,data:{kind:'video-generation',draft:spec,inputBindings:[],stale:true}}}},
  {id:randomUUID(),type:'add_edge',payload:{edge:{id:randomUUID(),sourceId:t1,targetId:v1,port:'text',order:0}}},
 ]}}});
 await page.goto('/projects/'+project.id+'/canvas');
 await expect(page.getByRole('status')).toContainText('已保存');
 // 另一设备先提交，制造云端修订冲突
 expect((await workspace.call('POST','/studio-api/projects/'+project.id+'/commands',{...h,payload:{expectedRevision:1,idempotencyKey:randomUUID(),command:{type:'operations',operations:[{id:randomUUID(),type:'add_node',payload:{node:{id:randomUUID(),type:'text',title:'外部新节点',x:40,y:400,locked:false,data:{kind:'text',text:'外部正文',referenceTokens:[]}}}}]}}})).statusCode).toBe(200);
 // 本页填写新正文后保存必然409：正文保留、生成入口禁用、上游POST为0
 await page.locator('[data-interaction-id="cloud:canvas:node-text"]').first().fill('冲突下不丢失的正文');
 await page.getByRole('button',{name:'保存到云端',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('保存未完成',{timeout:15000});
 await expect(page.locator('[data-interaction-id="cloud:canvas:node-text"]').first()).toHaveValue('冲突下不丢失的正文');
 await expect(page.locator('[data-interaction-id="V-08"]')).toBeDisabled();
 expect(workspace.providerCalls.filter(call=>!((call.method??'GET')==='GET'&&['/healthz','/v1/models'].includes(new URL(call.url).pathname)))).toHaveLength(0);
 expect((await workspace.pool.query('SELECT count(*)::int n FROM workspace_video_runs')).rows[0].n).toBe(0);
 // 放弃本页输入并重载：采用最新云端修订
 await page.getByRole('button',{name:'重新加载画布',exact:true}).click();
 await page.getByRole('button',{name:'放弃未保存输入并重新加载',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('已保存');
 await expect(page.getByText('外部新节点',{exact:false}).first()).toBeVisible();
});
test('concurrent double confirmation with one approval yields a single run',async({page,workspace})=>{
 const h=workspace.headers(workspace.account);
 expect((await workspace.call('PATCH','/studio-api/me/model-configs/video',{...h,payload:{apiBase:'https://video.example.test',model:'seedance',apiKey:'FAKE_VIDEO_UI_KEY',expectedRevision:null}})).statusCode).toBe(200);
 const project=(await workspace.call('POST','/studio-api/projects',{...h,payload:{title:'重复确认幂等'}})).json();
 const t1=randomUUID(),v1=randomUUID(),spec={modelId:'seedance',durationSeconds:5,ratio:'16:9',resolution:'480p'};
 await workspace.call('POST','/studio-api/projects/'+project.id+'/commands',{...h,payload:{expectedRevision:0,idempotencyKey:randomUUID(),command:{type:'operations',operations:[
  {id:randomUUID(),type:'add_node',payload:{node:{id:t1,type:'text',title:'创意',x:40,y:40,locked:false,data:{kind:'text',text:'幂等正文',referenceTokens:[]}}}},
  {id:randomUUID(),type:'add_node',payload:{node:{id:v1,type:'video-generation',title:'视频草稿',x:440,y:40,locked:false,data:{kind:'video-generation',draft:spec,inputBindings:[],stale:true}}}},
  {id:randomUUID(),type:'add_edge',payload:{edge:{id:randomUUID(),sourceId:t1,targetId:v1,port:'text',order:0}}},
 ]}}});
 await page.goto('/projects/'+project.id+'/canvas');
 await page.locator('[data-interaction-id="V-08"]').click();
 await expect(page.getByRole('dialog',{name:'确认云端视频生成',exact:true})).toBeVisible();expect((await latestPreview(workspace,project.id)).nodes[0].inputSnapshot.prompt).toContain('幂等正文');

 const approval=(await workspace.pool.query('SELECT id FROM workspace_video_previews WHERE project_id=$1',[project.id])).rows[0].id;
 const payload={approvalId:approval,decision:{confirmed:true,acknowledgeVideoFee:true}};
 const [first,second]=await Promise.all([
  workspace.call('POST','/studio-api/projects/'+project.id+'/video-runs',{...h,payload}),
  workspace.call('POST','/studio-api/projects/'+project.id+'/video-runs',{...h,payload}),
 ]);
 expect(first.statusCode).toBe(202);expect(second.statusCode).toBe(202);
 expect(first.json()[0].id).toBe(second.json()[0].id);
 expect((await workspace.pool.query('SELECT count(*)::int n FROM workspace_video_runs')).rows[0].n).toBe(1);
});
test('double clicking confirm while the request is pending sends one request and one provider POST',async({page,workspace})=>{
 // 自独立审计迁移：真实浏览器双击（与上文API并发专测区分），延迟首次请求验证按钮禁用与单次提交。
 const h=workspace.headers(workspace.account);
 expect((await workspace.call('PATCH','/studio-api/me/model-configs/video',{...h,payload:{apiBase:'https://video.example.test',model:'seedance',apiKey:'FAKE_VIDEO_UI_KEY',expectedRevision:null}})).statusCode).toBe(200);
 const project=(await workspace.call('POST','/studio-api/projects',{...h,payload:{title:'双击确认单次提交'}})).json();
 const t1=randomUUID(),v1=randomUUID(),spec={modelId:'seedance',durationSeconds:5,ratio:'16:9',resolution:'480p'};
 await workspace.call('POST','/studio-api/projects/'+project.id+'/commands',{...h,payload:{expectedRevision:0,idempotencyKey:randomUUID(),command:{type:'operations',operations:[
  {id:randomUUID(),type:'add_node',payload:{node:{id:t1,type:'text',title:'创意',x:40,y:40,locked:false,data:{kind:'text',text:'双击正文',referenceTokens:[]}}}},
  {id:randomUUID(),type:'add_node',payload:{node:{id:v1,type:'video-generation',title:'视频草稿',x:440,y:40,locked:false,data:{kind:'video-generation',draft:spec,inputBindings:[],stale:true}}}},
  {id:randomUUID(),type:'add_edge',payload:{edge:{id:randomUUID(),sourceId:t1,targetId:v1,port:'text',order:0}}},
 ]}}});
 await page.goto('/projects/'+project.id+'/canvas');
 await page.locator('[data-interaction-id="V-08"]').click();
 await expect(page.getByRole('dialog',{name:'确认云端视频生成',exact:true})).toBeVisible();expect((await latestPreview(workspace,project.id)).nodes[0].inputSnapshot.prompt).toContain('双击正文');

 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});const attempts:unknown[]=[];
 await page.route('**/studio-api/projects/*/video-runs',async route=>{
  attempts.push(route.request().postDataJSON());await gate;await route.fallback();
 });
 try{
  const button=page.getByRole('button',{name:'确认',exact:true});
  await button.dblclick();
  await expect(button).toBeDisabled();
  await expect.poll(()=>attempts.length).toBe(1);
  release();
  await expect(page.getByRole('button',{name:'查看视频任务',exact:true})).toBeVisible();
  expect(attempts).toHaveLength(1);
  expect((await workspace.pool.query('SELECT count(*)::int n FROM workspace_video_runs')).rows[0].n).toBe(1);
  await expect.poll(()=>workspace.providerCalls.filter(c=>c.method==='POST').length).toBe(1);
 }finally{release();}
});
