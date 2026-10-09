import {randomUUID} from 'node:crypto';
import {test,expect} from '../helpers/cloud-workspace-ui-fixture';
test('retains manual revisions and inserts the selected result with its owned provenance into a cloud canvas',async({page,workspace})=>{
 const created=await workspace.call('POST','/studio-api/projects',{...workspace.headers(workspace.account),payload:{title:'写作目标画布'}});expect(created.statusCode).toBe(201);
 await page.goto('/prompt-generator');await page.getByRole('button',{name:'新建视频写作草稿',exact:true}).click();await page.getByLabel('原始创意',{exact:true}).fill('一镜到底的雨后街道');await page.getByRole('button',{name:'保存写作草稿',exact:true}).click();await expect(page.getByRole('status')).toContainText('草稿已保存');await page.getByRole('button',{name:'规则整理',exact:true}).click();await expect(page.getByLabel('结果正文',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'人工修改结果',exact:true}).click();await page.getByLabel('人工结果正文',{exact:true}).fill('我修订后的镜头正文');await page.getByRole('button',{name:'保存为新的人工结果',exact:true}).click();await expect(page.getByLabel('结果正文',{exact:true}).first()).toHaveText('我修订后的镜头正文');
 await page.getByRole('button',{name:'插入文字',exact:true}).first().click();await page.getByRole('button',{name:'确认应用到云端画布',exact:true}).click();await expect(page.getByRole('dialog',{name:'应用写作结果到画布',exact:true})).not.toBeVisible();
 const stored=(await workspace.pool.query('SELECT graph FROM workspace_graphs WHERE project_id=$1',[created.json().id])).rows[0].graph;
 expect(stored.nodes[0].data).toMatchObject({text:'我修订后的镜头正文',promptGenerationSource:{origin:'manual',sourceRevision:2}});
 const draft=(await workspace.pool.query("SELECT document FROM workspace_content WHERE kind='draft'")).rows[0].document;expect(draft.resultVersions).toHaveLength(2);expect(stored.nodes[0].data.promptGenerationSource.resultVersionId).toBe(draft.resultVersions[1].id);
 await page.getByRole('button',{name:'恢复此历史结果',exact:true}).last().click();await expect(page.getByLabel('结果正文',{exact:true})).toHaveCount(3);
 await page.getByRole('button',{name:'插入文字',exact:true}).first().click();await page.getByLabel('目标文字节点',{exact:true}).selectOption(stored.nodes[0].id);await page.getByRole('button',{name:'确认应用到云端画布',exact:true}).click();await expect(page.getByRole('dialog',{name:'应用写作结果到画布',exact:true})).not.toBeVisible();
 const restored=(await workspace.pool.query('SELECT graph FROM workspace_graphs WHERE project_id=$1',[created.json().id])).rows[0].graph;expect(restored.nodes).toHaveLength(1);expect(restored.nodes[0].data.text).toBe(draft.resultVersions[0].finalPrompt);const revised=(await workspace.pool.query("SELECT document FROM workspace_content WHERE kind='draft'")).rows[0].document;expect(revised.resultVersions[2].restoredFromVersionId).toBe(draft.resultVersions[0].id);
 await page.screenshot({path:'work/account-api-cloud/cloud-prompt-results.png',fullPage:true});
});
test('applies a writing result to a named video draft and creates a new flow without touching the other draft',async({page,workspace})=>{
 const h=workspace.headers(workspace.account);
 const project=(await workspace.call('POST','/studio-api/projects',{...h,payload:{title:'多目标应用'}})).json();
 const sharedId=randomUUID(),v1=randomUUID(),v2=randomUUID();
 const spec={modelId:'seedance',durationSeconds:5,ratio:'16:9',resolution:'480p'};
 const setup=await workspace.call('POST','/studio-api/projects/'+project.id+'/commands',{...h,payload:{expectedRevision:0,idempotencyKey:randomUUID(),command:{type:'operations',operations:[
  {id:randomUUID(),type:'add_node',payload:{node:{id:sharedId,type:'text',title:'共享文字',x:40,y:40,locked:false,data:{kind:'text',text:'共享原正文',referenceTokens:[]}}}},
  {id:randomUUID(),type:'add_node',payload:{node:{id:v1,type:'video-generation',title:'视频一',x:440,y:40,locked:false,data:{kind:'video-generation',draft:spec,inputBindings:[],stale:true}}}},
  {id:randomUUID(),type:'add_node',payload:{node:{id:v2,type:'video-generation',title:'视频二',x:440,y:400,locked:false,data:{kind:'video-generation',draft:spec,inputBindings:[],stale:true}}}},
  {id:randomUUID(),type:'add_edge',payload:{edge:{id:randomUUID(),sourceId:sharedId,targetId:v1,port:'text',order:0}}},
  {id:randomUUID(),type:'add_edge',payload:{edge:{id:randomUUID(),sourceId:sharedId,targetId:v2,port:'text',order:0}}},
 ]}}});
 expect(setup.statusCode).toBe(200);
 await page.goto('/prompt-generator');await page.getByRole('button',{name:'新建视频写作草稿',exact:true}).click();
 await page.getByLabel('原始创意',{exact:true}).fill('新应用正文的多目标检查');
 await page.getByRole('button',{name:'保存写作草稿',exact:true}).click();await page.getByRole('button',{name:'规则整理',exact:true}).click();
 await expect(page.getByLabel('结果正文',{exact:true})).toBeVisible();
 // 应用到视频一：追加，不替换共享文字
 await page.getByRole('button',{name:'应用到视频草稿',exact:true}).first().click();
 await page.getByLabel('目标项目',{exact:true}).selectOption(project.id);
 await page.getByLabel('目标视频草稿',{exact:true}).selectOption(v1);
 await expect(page.getByText('已有 1 个文字输入',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'确认应用到云端画布',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'应用写作结果到画布',exact:true})).not.toBeVisible();
 let graph=(await workspace.pool.query('SELECT graph FROM workspace_graphs WHERE project_id=$1',[project.id])).rows[0].graph;
 const sharedAfter=graph.nodes.find((n:{id:string})=>n.id===sharedId);
 expect(sharedAfter.data.text).toBe('共享原正文');
 const v1Edges=graph.edges.filter((e:{targetId:string})=>e.targetId===v1);
 expect(v1Edges).toHaveLength(2);
 const v2Edges=graph.edges.filter((e:{targetId:string})=>e.targetId===v2);
 expect(v2Edges).toHaveLength(1);
 // 对视频二做替换：只改当前视频连接，原文字保留
 await page.getByRole('button',{name:'应用到视频草稿',exact:true}).first().click();
 await page.getByLabel('目标项目',{exact:true}).selectOption(project.id);
 await page.getByLabel('目标视频草稿',{exact:true}).selectOption(v2);
 const replace=page.locator('[data-interaction-id="cloud:draft:apply-replace"]');
 await replace.check();
 await page.getByRole('button',{name:'确认应用到云端画布',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'应用写作结果到画布',exact:true})).not.toBeVisible();
 graph=(await workspace.pool.query('SELECT graph FROM workspace_graphs WHERE project_id=$1',[project.id])).rows[0].graph;
 expect(graph.nodes.find((n:{id:string})=>n.id===sharedId).data.text).toBe('共享原正文');
 expect(graph.edges.filter((e:{targetId:string})=>e.targetId===v2)).toHaveLength(1);
 expect(graph.edges.find((e:{targetId:string})=>e.targetId===v2).sourceId).not.toBe(sharedId);
 // 另一个草稿的文字和连接未被改变
 expect(graph.edges.filter((e:{targetId:string})=>e.targetId===v1)).toHaveLength(2);
});
test('creates a new video flow from a writing result in one cloud command batch',async({page,workspace})=>{
 const h=workspace.headers(workspace.account);
 const project=(await workspace.call('POST','/studio-api/projects',{...h,payload:{title:'新建流程目标'}})).json();
 expect((await workspace.call('PATCH','/studio-api/me/model-configs/video',{...h,payload:{apiBase:'https://video.example.test',model:'seedance',apiKey:'FAKE_VIDEO_FLOW_KEY',expectedRevision:null}})).statusCode).toBe(200);
 await page.goto('/prompt-generator');await page.getByRole('button',{name:'新建视频写作草稿',exact:true}).click();
 await page.getByLabel('原始创意',{exact:true}).fill('创建流程的写作正文');
 await page.getByRole('button',{name:'保存写作草稿',exact:true}).click();await page.getByRole('button',{name:'规则整理',exact:true}).click();
 await expect(page.getByLabel('结果正文',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'创建视频流程',exact:true}).first().click();
 await page.getByLabel('目标项目',{exact:true}).selectOption(project.id);
 await page.getByLabel('新建视频草稿标题',{exact:true}).fill('新视频流程');
 // 默认按写作请求解析：未指定请求时需用户明确选择，不静默取目录首项
 await expect(page.getByText('请明确选择一个已核验规格',{exact:false})).toBeVisible();
 await page.getByLabel('执行规格',{exact:true}).selectOption({index:1});
 await page.getByRole('button',{name:'确认应用到云端画布',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'应用写作结果到画布',exact:true})).not.toBeVisible();
 const graph=(await workspace.pool.query('SELECT graph FROM workspace_graphs WHERE project_id=$1',[project.id])).rows[0].graph;
 expect(graph.nodes.filter((n:{type:string})=>n.type==='text')).toHaveLength(1);
 expect(graph.nodes.filter((n:{type:string})=>n.type==='video-generation')).toHaveLength(1);
 expect(graph.edges).toHaveLength(1);
 expect(workspace.providerCalls.filter(c=>c.method==='POST')).toHaveLength(0);
});
test('replays the identical committed apply request after the browser response is lost',async({page,workspace})=>{
 // 自独立审计迁移：首次请求直达真实隔离后端并已应用，仅浏览器回执丢失；重试必须同payload/key，修订不增长。
 const h=workspace.headers(workspace.account);
 const project=(await workspace.call('POST','/studio-api/projects',{...h,payload:{title:'应用重试同一请求'}})).json();
 const v1=randomUUID(),t0=randomUUID(),spec={modelId:'seedance',durationSeconds:5,ratio:'16:9',resolution:'480p'};
 await workspace.call('POST','/studio-api/projects/'+project.id+'/commands',{...h,payload:{expectedRevision:0,idempotencyKey:randomUUID(),command:{type:'operations',operations:[
  {id:randomUUID(),type:'add_node',payload:{node:{id:t0,type:'text',title:'已有文字',x:40,y:40,locked:false,data:{kind:'text',text:'已有正文',referenceTokens:[]}}}},
  {id:randomUUID(),type:'add_node',payload:{node:{id:v1,type:'video-generation',title:'视频一',x:440,y:40,locked:false,data:{kind:'video-generation',draft:spec,inputBindings:[],stale:true}}}},
  {id:randomUUID(),type:'add_edge',payload:{edge:{id:randomUUID(),sourceId:t0,targetId:v1,port:'text',order:0}}},
 ]}}});
 const attempts:unknown[]=[];
 await page.route('**/studio-api/projects/*/commands',async route=>{
  if(route.request().method()!=='POST')return route.fallback();
  const payload=route.request().postDataJSON();attempts.push(payload);
  if(attempts.length===1){
   const committed=await workspace.call('POST',new URL(route.request().url()).pathname,{...h,payload});
   expect(committed.statusCode).toBe(200);
   expect(committed.json()).toMatchObject({status:'applied',revision:2});
   const saved=(await workspace.pool.query('SELECT graph FROM workspace_graphs WHERE project_id=$1',[project.id])).rows[0].graph;
   expect(saved.revision).toBe(2);expect(saved.nodes.filter((n:{type:string})=>n.type==='text')).toHaveLength(2);
   await route.abort('failed');return;
  }
  expect(payload).toEqual(attempts[0]);
  await route.fallback();
 });
 await page.goto('/prompt-generator');await page.getByRole('button',{name:'新建视频写作草稿',exact:true}).click();
 await page.getByLabel('原始创意',{exact:true}).fill('重试同一请求的写作正文');
 await page.getByRole('button',{name:'保存写作草稿',exact:true}).click();await page.getByRole('button',{name:'规则整理',exact:true}).click();
 await expect(page.getByLabel('结果正文',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'应用到视频草稿',exact:true}).first().click();
 await page.getByLabel('目标项目',{exact:true}).selectOption(project.id);
 await page.getByLabel('目标视频草稿',{exact:true}).selectOption(v1);
 // 首次提交丢失：对话框保留，追加/替换选项被冻结，重试提示可见
 await page.getByRole('button',{name:'确认应用到云端画布',exact:true}).click();
 await expect(page.getByText('重试沿用同一请求',{exact:false})).toBeVisible();
 await expect(page.locator('[data-interaction-id="cloud:draft:apply-append"]')).toBeDisabled();
 await expect(page.locator('[data-interaction-id="cloud:draft:apply-replace"]')).toBeDisabled();
 // 同一请求重试（默认追加）：一次应用成功，不重复建节点，原文字保留
 await page.getByRole('button',{name:'确认应用到云端画布',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'应用写作结果到画布',exact:true})).not.toBeVisible();
 expect(attempts).toHaveLength(2);expect(attempts[1]).toEqual(attempts[0]);
 const graph=(await workspace.pool.query('SELECT graph FROM workspace_graphs WHERE project_id=$1',[project.id])).rows[0].graph;
 expect(graph.revision).toBe(2);
 expect(graph.nodes.find((n:{id:string})=>n.id===t0).data.text).toBe('已有正文');
 expect(graph.nodes.filter((n:{type:string})=>n.type==='text')).toHaveLength(2);
 expect(graph.edges.filter((e:{targetId:string})=>e.targetId===v1)).toHaveLength(2);
 expect(workspace.providerCalls.filter(c=>c.method==='POST')).toHaveLength(0);
});
test('refuses to silently substitute when the writing request exceeds the verified capability',async({page,workspace})=>{
 const h=workspace.headers(workspace.account);
 const project=(await workspace.call('POST','/studio-api/projects',{...h,payload:{title:'规格不一致目标'}})).json();
 expect((await workspace.call('PATCH','/studio-api/me/model-configs/video',{...h,payload:{apiBase:'https://video.example.test',model:'seedance',apiKey:'FAKE_VIDEO_FLOW_KEY',expectedRevision:null}})).statusCode).toBe(200);
 await page.goto('/prompt-generator');await page.getByRole('button',{name:'新建视频写作草稿',exact:true}).click();
 await page.getByLabel('原始创意',{exact:true}).fill('15秒936规格的写作请求');
 // 写作请求 15秒/9:16，而隔离目录仅 5秒/16:9：必须明示不支持，不静默建成5秒
 await page.locator('[data-interaction-id="PG10"]').fill('15');
 await page.locator('[data-interaction-id="ui:PromptForm:input:a944108bfffb"]').fill('9:16');
 await page.getByRole('button',{name:'保存写作草稿',exact:true}).click();await page.getByRole('button',{name:'规则整理',exact:true}).click();
 await expect(page.getByLabel('结果正文',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'创建视频流程',exact:true}).first().click();
 await page.getByLabel('目标项目',{exact:true}).selectOption(project.id);
 // 确认按钮在用户明确选择前保持禁用，且提示不支持原因
 await expect(page.getByText('在当前已核验规格中不支持',{exact:false})).toBeVisible();
 await expect(page.getByRole('button',{name:'确认应用到云端画布',exact:true})).toBeDisabled();
 await page.getByLabel('执行规格',{exact:true}).selectOption({index:1});
 await expect(page.getByText('不一致，将按所选规格创建',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'确认应用到云端画布',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'应用写作结果到画布',exact:true})).not.toBeVisible();
 const graph=(await workspace.pool.query('SELECT graph FROM workspace_graphs WHERE project_id=$1',[project.id])).rows[0].graph;
 const createdVideo=graph.nodes.find((n:{type:string})=>n.type==='video-generation');
 expect(createdVideo.data.draft).toMatchObject({durationSeconds:5,ratio:'16:9'});
 expect(workspace.providerCalls.filter(c=>c.method==='POST')).toHaveLength(0);
});
