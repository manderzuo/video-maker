import {randomUUID} from 'node:crypto';
import {test,expect} from '../helpers/cloud-workspace-ui-fixture';

test('simplifies navigation and keeps manual save and both writing surfaces consistent',async({page,workspace})=>{
 const project=(await workspace.call('POST','/studio-api/projects',{...workspace.headers(workspace.account),payload:{title:'精简工作区'}})).json();
 await page.goto('/projects');
 for(const name of ['命令面板','通知','使用原创模板','导入云端项目包','重新加载项目'])await expect(page.getByRole('button',{name,exact:true})).toHaveCount(0);
 const nav=page.getByRole('navigation',{name:'主导航'});
 await expect(nav.getByRole('link',{name:'回收站',exact:true})).toBeVisible();
 await expect(nav.getByRole('link',{name:'回收站',exact:true}).locator('svg')).toHaveCount(1);
 for(const label of ['恢复中心','旧版数据迁移','项目备份','账号偏好'])await expect(page.locator('.navigation-footer').getByRole('link',{name:label,exact:true})).toHaveCount(0);
 await page.goto('/settings/connections');await expect(page.getByRole('link',{name:'账号偏好',exact:true})).toBeVisible();
 await page.goto('/projects/'+project.id+'/canvas');
 for(const name of ['选择 V','平移 H','保存详情'])await expect(page.getByRole('button',{name,exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'保存到云端',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'提示词生成面板',exact:true}).click();
 await page.getByRole('button',{name:'新建视频写作草稿',exact:true}).click();
 await expect(page.getByRole('region',{name:'写作输入'}).getByRole('button',{name:'AI 优化',exact:true})).toBeVisible();
 for(const name of ['保存写作草稿','规则整理','移入写作草稿回收站'])await expect(page.getByRole('button',{name,exact:true})).toHaveCount(0);
 expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(0);
});

test('saves edited input before AI preview and preserves it when saving fails',async({page,workspace})=>{
 const h=workspace.headers(workspace.account);
 expect((await workspace.call('PATCH','/studio-api/me/model-configs/text',{...h,payload:{apiBase:'https://api.example.test',model:'Vendor/Text',apiKey:'FAKE_SIMPLIFY_TEXT_KEY',expectedRevision:null}})).statusCode).toBe(200);
 await page.goto('/prompt-generator');await page.getByRole('button',{name:'新建视频写作草稿',exact:true}).click();
 let fail=true,previews=0;
 await page.route('**/studio-api/prompt-drafts/*',async route=>{if(route.request().method()==='PATCH'&&fail){await route.fulfill({status:500,contentType:'application/json',body:'{"code":"INTERNAL_ERROR"}'});return;}await route.fallback();});
 page.on('request',request=>{if(request.url().includes('/optimization-preview'))previews++;});
 await page.getByLabel('原始创意',{exact:true}).fill('必须先保存的创意');await page.getByRole('button',{name:'AI 优化',exact:true}).click();
 await expect(page.getByRole('alert')).toBeVisible();await expect(page.getByLabel('原始创意',{exact:true})).toHaveValue('必须先保存的创意');
 expect(previews).toBe(0);expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(0);
 fail=false;await page.getByRole('button',{name:'重试保存写作输入',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('自动保存');await page.getByRole('button',{name:'AI 优化',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'确认 AI 文字优化',exact:true})).toBeVisible();
 const stored=(await workspace.pool.query("SELECT document FROM workspace_content WHERE kind='draft'")).rows[0].document;
 expect(stored.userRequest).toBe('必须先保存的创意');expect(stored.revision).toBe(1);expect(previews).toBe(1);
 expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(0);
});

test('opens each generated video in its own canvas and classifies complete operation history by project',async({page,workspace})=>{
 const h=workspace.headers(workspace.account);
 expect((await workspace.call('PATCH','/studio-api/me/model-configs/video',{...h,payload:{apiBase:'https://video.example.test',model:'seedance',apiKey:'FAKE_SIMPLIFY_VIDEO_KEY',expectedRevision:null}})).statusCode).toBe(200);
 const project=(await workspace.call('POST','/studio-api/projects',{...h,payload:{title:'视频所属项目'}})).json(),other=(await workspace.call('POST','/studio-api/projects',{...h,payload:{title:'另一个项目'}})).json();
 const textId=randomUUID(),videoId=randomUUID();
 expect((await workspace.call('POST','/studio-api/projects/'+project.id+'/commands',{...h,payload:{expectedRevision:0,idempotencyKey:randomUUID(),command:{type:'operations',operations:[
  {id:randomUUID(),type:'add_node',payload:{node:{id:textId,type:'text',title:'视频文字',x:40,y:40,locked:false,data:{kind:'text',text:'雨后街道',referenceTokens:[]}}}},
  {id:randomUUID(),type:'add_node',payload:{node:{id:videoId,type:'video-generation',title:'目标视频草稿',x:440,y:40,locked:false,data:{kind:'video-generation',draft:{modelId:'seedance',durationSeconds:5,ratio:'16:9',resolution:'480p'},inputBindings:[],stale:true}}}},
  {id:randomUUID(),type:'add_edge',payload:{edge:{id:randomUUID(),sourceId:textId,targetId:videoId,port:'text',order:0}}}
 ]}}})).statusCode).toBe(200);
 const prepared=await workspace.call('POST','/studio-api/projects/'+project.id+'/video-run-preview',{...h,payload:{expectedRevision:1,configRevision:1,nodeIds:[videoId]}});expect(prepared.statusCode).toBe(201);const preview=prepared.json();
 const submitted=await workspace.call('POST','/studio-api/projects/'+project.id+'/video-runs',{...h,payload:{approvalId:preview.id,decision:{confirmed:true,acknowledgeVideoFee:true}}});expect(submitted.statusCode).toBe(202);
 await expect.poll(async()=>(await workspace.pool.query("SELECT document->>'executionState' AS state FROM workspace_video_runs WHERE project_id=$1",[project.id])).rows[0]?.state,{timeout:15000}).toBe('succeeded');
 await page.goto('/tasks');await expect(page.locator('[data-interaction-id="cloud:tasks:result-media"]')).toBeVisible();
 await page.getByRole('button',{name:'查看任务详情',exact:true}).click();await expect(page).toHaveURL(new RegExp('/projects/'+project.id+'/canvas\\?node='+videoId));
 await expect(page.locator('[data-node-id="'+videoId+'"]')).toHaveClass(/selected/);
 await page.goto('/activity');await page.getByLabel('按项目分类',{exact:true}).selectOption(project.id);
 const rows=page.locator('[data-interaction-id="cloud:activity:record"]');await expect(rows.filter({hasText:'画布编辑与保存'})).not.toHaveCount(0);await expect(rows.filter({hasText:'视频任务状态更新'})).not.toHaveCount(0);
 await expect(rows.filter({hasText:other.title})).toHaveCount(0);
 await page.getByLabel('按项目分类',{exact:true}).selectOption(other.id);await expect(rows).toHaveCount(1);await expect(rows).toContainText('创建项目');
});

test('lists every generated prompt body by default and inserts an edited result into the chosen canvas',async({page,workspace})=>{
 const h=workspace.headers(workspace.account),project=(await workspace.call('POST','/studio-api/projects',{...h,payload:{title:'插入目标'}})).json();
 const draft=(await workspace.call('POST','/studio-api/prompt-drafts',{...h,payload:{type:'video',userRequest:'雨后街道',sceneId:'text',requestedSpec:{},audioPlan:'',lockedConstraints:[],references:[],ruleVersion:'studio-video-rules-v1',idempotencyKey:randomUUID()}})).json();
 const result=(await workspace.call('POST','/studio-api/prompt-drafts/'+draft.id+'/compile',{...h,payload:{expectedRevision:0}})).json();
 expect((await workspace.call('POST','/studio-api/prompts',{...h,payload:{title:'独立保存的提示词',body:'独立正文',tags:[],variables:[],source:'原创',license:'用户创作',starred:false,idempotencyKey:randomUUID()}})).statusCode).toBe(201);
 await page.goto('/prompts');await expect(page.getByText(result.resultVersions[0].finalPrompt,{exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'独立保存的提示词',exact:true})).toBeVisible();
 await expect(page.getByText('导入提示词JSON',{exact:true})).toHaveCount(0);
 await page.goto('/prompt-generator?draft='+draft.id);
 await page.getByLabel('结果正文',{exact:true}).fill('新的人工镜头正文');
 await page.getByRole('button',{name:'插入到画布中',exact:true}).click();
 await page.getByLabel('目标项目',{exact:true}).selectOption(project.id);
 await page.getByRole('button',{name:'确认插入',exact:true}).click();
 await expect(page).toHaveURL(new RegExp('/projects/'+project.id+'/canvas\\?node='));
 await expect(page.getByLabel('节点文本',{exact:true})).toHaveValue('新的人工镜头正文');
 const graph=(await workspace.pool.query('SELECT graph FROM workspace_graphs WHERE project_id=$1',[project.id])).rows[0].graph;
 expect(graph.nodes).toHaveLength(1);expect(graph.nodes[0].data.promptGenerationSource.origin).toBe('manual');
 expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(0);
});
test('loads older operations after the first page without repeating or hiding project records',async({page,workspace})=>{
 const h=workspace.headers(workspace.account),project=(await workspace.call('POST','/studio-api/projects',{...h,payload:{title:'分页活动项目'}})).json();
 await workspace.pool.query("INSERT INTO workspace_activity(id,user_id,project_id,project_title,method,route,status,created_at) SELECT gen_random_uuid(),$1,$2,'分页活动项目','PATCH','/studio-api/projects/:id',200,'2026-10-10T12:00:00Z'::timestamptz FROM generate_series(1,60)",[workspace.account.view.user.id,project.id]);
 await page.goto('/activity');await page.getByLabel('按项目分类',{exact:true}).selectOption(project.id);
 const rows=page.locator('[data-interaction-id="cloud:activity:record"]');await expect(rows).toHaveCount(50);await page.getByRole('button',{name:'加载更早的操作',exact:true}).click();await expect(rows).toHaveCount(61);await expect(page.getByRole('button',{name:'加载更早的操作',exact:true})).toHaveCount(0);
});
