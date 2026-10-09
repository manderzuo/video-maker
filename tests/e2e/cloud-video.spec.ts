import {randomUUID} from 'node:crypto';
import {test,expect} from '../helpers/cloud-workspace-ui-fixture';
import type {fixture,Account} from '../../server/tests/account-fixture';
async function savedProject(workspace:Awaited<ReturnType<typeof fixture>>&{account:Account}){
 const h=workspace.headers(workspace.account);expect((await workspace.call('PATCH','/studio-api/me/model-configs/video',{...h,payload:{apiBase:'https://video.example.test',model:'seedance',apiKey:'FAKE_VIDEO_UI_KEY',expectedRevision:null}})).statusCode).toBe(200);
 const project=(await workspace.call('POST','/studio-api/projects',{...h,payload:{title:'失败与取消检查'}})).json(),textId=randomUUID(),nodeId=randomUUID();expect((await workspace.call('POST','/studio-api/projects/'+project.id+'/commands',{...h,payload:{expectedRevision:0,idempotencyKey:randomUUID(),command:{type:'operations',operations:[{id:randomUUID(),type:'add_node',payload:{node:{id:textId,type:'text',title:'创意',x:40,y:40,locked:false,data:{kind:'text',text:'安全转换的输入',referenceTokens:[]}}}},{id:randomUUID(),type:'add_node',payload:{node:{id:nodeId,type:'video-generation',title:'视频草稿',x:440,y:40,locked:false,data:{kind:'video-generation',draft:{modelId:'seedance',durationSeconds:5,ratio:'16:9',resolution:'480p'},inputBindings:[],stale:true}}}},{id:randomUUID(),type:'add_edge',payload:{edge:{id:randomUUID(),sourceId:textId,targetId:nodeId,port:'text',order:0}}}]}}})).statusCode).toBe(200);return project;
}
test('previews exact owned cloud video inputs, confirms once, saves the private result and inserts durable lineage',async({page,workspace})=>{
 const h=workspace.headers(workspace.account);await workspace.call('PATCH','/studio-api/me/model-configs/video',{...h,payload:{apiBase:'https://video.example.test',model:'seedance',apiKey:'FAKE_VIDEO_UI_KEY',expectedRevision:null}});
 const project=(await workspace.call('POST','/studio-api/projects',{...h,payload:{title:'云端视频流程'}})).json(),textId=randomUUID(),nodeId=randomUUID();await workspace.call('POST','/studio-api/projects/'+project.id+'/commands',{...h,payload:{expectedRevision:0,idempotencyKey:randomUUID(),command:{type:'operations',operations:[{id:randomUUID(),type:'add_node',payload:{node:{id:textId,type:'text',title:'创意',x:40,y:40,locked:false,data:{kind:'text',text:'雨后街道',referenceTokens:[]}}}},{id:randomUUID(),type:'add_node',payload:{node:{id:nodeId,type:'video-generation',title:'视频草稿',x:440,y:40,locked:false,data:{kind:'video-generation',draft:{modelId:'seedance',durationSeconds:5,ratio:'16:9',resolution:'480p'},inputBindings:[],stale:true}}}},{id:randomUUID(),type:'add_edge',payload:{edge:{id:randomUUID(),sourceId:textId,targetId:nodeId,port:'text',order:0}}}]}}});
 await page.goto('/projects/'+project.id+'/canvas');await page.getByRole('button',{name:'生成视频',exact:true}).click();const preview=page.getByRole('dialog',{name:'确认云端视频生成',exact:true});await expect(preview).toContainText('雨后街道');await expect(preview).toContainText('5 秒');expect(workspace.providerCalls).toHaveLength(0);await expect(page.getByRole('button',{name:'确认生成',exact:true})).toBeDisabled();await page.getByLabel('我确认所列视频生成可能收费',{exact:true}).check();await page.getByRole('button',{name:'确认生成',exact:true}).click();await expect(page.getByRole('button',{name:'查看视频任务',exact:true})).toBeVisible();
 await page.reload();await expect.poll(async()=>(await workspace.pool.query("SELECT document->>'deliveryState' state FROM workspace_video_runs")).rows[0]?.state,{timeout:15000}).toBe('available_for_preview');await page.getByRole('button',{name:'查看视频任务',exact:true}).click();const detail=page.getByRole('dialog',{name:'云端视频任务',exact:true});await expect(detail).toContainText('生成已完成');await page.getByRole('button',{name:'添加结果到原画布',exact:true}).click();await expect(detail).toContainText('视频结果已添加到原画布');await detail.getByRole('button',{name:'关闭云端视频任务',exact:true}).click();await page.reload();await expect(page.locator('.node-result')).toHaveCount(1);expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(1);expect(workspace.providerCalls.every(call=>call.apiKey==='FAKE_VIDEO_UI_KEY')).toBe(true);await page.screenshot({path:'work/account-api-cloud/cloud-video-result.png',fullPage:true});
 await page.getByRole('link',{name:'任务中心',exact:true}).click();await page.getByRole('button',{name:'查看任务详情',exact:true}).click();await expect(page.getByRole('dialog',{name:'云端任务详情',exact:true})).toContainText('雨后街道');
});
test('keeps the safe 3003 reason and pending billing in both cloud task views after refresh',async({page,workspace})=>{
 workspace.setVideoOutcome('failed');const project=await savedProject(workspace);await page.goto('/projects/'+project.id+'/canvas');await page.getByRole('button',{name:'生成视频',exact:true}).click();await page.getByLabel('我确认所列视频生成可能收费',{exact:true}).check();await page.getByRole('button',{name:'确认生成',exact:true}).click();await expect.poll(async()=>(await workspace.pool.query("SELECT document->>'executionState' state FROM workspace_video_runs")).rows[0]?.state).toBe('failed_confirmed');await page.reload();await page.getByRole('button',{name:'查看视频任务',exact:true}).click();const detail=page.getByRole('dialog',{name:'云端视频任务',exact:true});for(const text of ['生成失败：上游判定参考图片可能包含真人，拒绝生成。','错误码：3003。','积分仍在核对，尚未确认最终扣费。'])await expect(detail).toContainText(text);await expect(detail).not.toContainText('FAKE_PRIVATE');await expect(detail).not.toContainText('input image');await page.getByRole('button',{name:'暂停原任务查询',exact:true}).click();await expect(detail).toContainText('原任务查询已暂停');await detail.getByRole('button',{name:'关闭云端视频任务',exact:true}).click();await page.getByRole('link',{name:'任务中心',exact:true}).click();await page.getByRole('button',{name:'查看任务详情',exact:true}).click();await expect(page.getByRole('dialog',{name:'云端任务详情',exact:true})).toContainText('生成失败：上游判定参考图片可能包含真人，拒绝生成。');expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(1);
});
test('canceling a video preview sends no provider request and does not create a run',async({page,workspace})=>{
 const project=await savedProject(workspace);await page.goto('/projects/'+project.id+'/canvas');await page.getByRole('button',{name:'生成视频',exact:true}).click();await page.getByRole('dialog',{name:'确认云端视频生成',exact:true}).getByRole('button',{name:'取消',exact:true}).click();expect(workspace.providerCalls).toHaveLength(0);expect((await workspace.pool.query('SELECT count(*)::int n FROM workspace_video_runs')).rows[0].n).toBe(0);
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
 // 侧栏选择来源与目标建立文字连线
 await page.locator('[data-interaction-id="cloud:canvas:source"]').selectOption({index:1});
 await page.locator('[data-interaction-id="cloud:canvas:target"]').selectOption({index:1});
 await page.getByRole('button',{name:'连接节点',exact:true}).click();
 await page.getByRole('button',{name:'保存到云端',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('已保存');
 await page.getByRole('button',{name:'生成视频',exact:true}).click();
 const preview=page.getByRole('dialog',{name:'确认云端视频生成',exact:true});
 await expect(preview).toContainText('纯界面雨后街道');
 expect(workspace.providerCalls).toHaveLength(0);
 await page.getByLabel('我确认所列视频生成可能收费',{exact:true}).check();
 await page.getByRole('button',{name:'确认生成',exact:true}).click();
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
 await expect(page.getByText('这个视频草稿还没有提示词',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'生成视频',exact:true}).click();
 await expect(page.getByText('以下视频草稿缺少明确连接的提示词正文',{exact:false})).toContainText('空草稿');
 expect(workspace.providerCalls).toHaveLength(0);
 // 就地填写提示词并保存后可生成
 await page.locator('[data-interaction-id="cloud:video:new-text"]').fill('补接后的正文');
 await page.getByRole('button',{name:'保存文字并连接',exact:true}).click();
 await page.getByRole('button',{name:'保存到云端',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('已保存');
 await page.getByRole('button',{name:'生成视频',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'确认云端视频生成',exact:true})).toContainText('补接后的正文');
 expect(workspace.providerCalls).toHaveLength(0);
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
 await page.locator('[data-interaction-id="cloud:canvas:outline-select"]').nth(1).check();
 await page.locator('[data-interaction-id="cloud:canvas:outline-select"]').nth(2).check();
 await expect(page.getByText('本次选择：',{exact:false})).toContainText('视频一');
 await page.getByRole('button',{name:'生成视频',exact:true}).click();
 const summary=page.getByText('以下视频草稿缺少明确连接的提示词正文',{exact:false});
 await expect(summary).toContainText('视频二');
 await expect(summary).not.toContainText('视频一');
 expect(workspace.providerCalls).toHaveLength(0);
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
 // 未保存时生成入口禁用，点击无预检、无上游POST
 await expect(page.getByRole('button',{name:'生成视频',exact:true})).toBeDisabled();
 expect(workspace.providerCalls).toHaveLength(0);
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
 await expect(page.getByRole('button',{name:'生成视频',exact:true})).toBeDisabled();
 expect(workspace.providerCalls).toHaveLength(0);
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
 await page.getByRole('button',{name:'生成视频',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'确认云端视频生成',exact:true})).toContainText('幂等正文');
 await page.getByLabel('我确认所列视频生成可能收费',{exact:true}).check();
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
