import {randomUUID} from 'node:crypto';
import {test,expect} from '../helpers/cloud-workspace-ui-fixture';
import {openCloudToolbarMenu} from '../helpers/cloud-toolbar';

test('persists the writing resolution selection across a reload',async({page,workspace})=>{
 const h=workspace.headers(workspace.account),draft=(await workspace.call('POST','/studio-api/prompt-drafts',{...h,payload:{type:'video',userRequest:'TEST DATA 清晰度',sceneId:'text',requestedSpec:{},audioPlan:'',lockedConstraints:[],references:[],ruleVersion:'studio-video-rules-v1',idempotencyKey:randomUUID()}})).json();
 await page.goto('/prompt-generator?draft='+draft.id);const resolution=page.getByLabel('清晰度目标',{exact:true});await expect(resolution).toHaveValue('');
 for(const value of ['480p','720p']){await resolution.selectOption(value);await expect.poll(async()=>(await workspace.call('GET','/studio-api/prompt-drafts/'+draft.id,h)).json().requestedSpec.resolution).toBe(value);}
 await page.reload();await expect(resolution).toHaveValue('720p');expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(0);
});

test('applies the selected writing resolution to a video draft and a new flow',async({page,workspace})=>{
 workspace.setVideoSpecs(['480p','720p'].map(resolution=>({modelId:'seedance',durationSeconds:5,ratio:'9:16',resolution})));
 const h=workspace.headers(workspace.account),project=(await workspace.call('POST','/studio-api/projects',{...h,payload:{title:'TEST DATA 清晰度应用'}})).json(),videoId=randomUUID();
 await workspace.call('PATCH','/studio-api/me/model-configs/video',{...h,payload:{apiBase:'https://video.example.test',model:'seedance',apiKey:'FAKE_RESOLUTION_KEY',expectedRevision:null}});
 await workspace.call('POST','/studio-api/projects/'+project.id+'/commands',{...h,payload:{expectedRevision:0,idempotencyKey:randomUUID(),command:{type:'operations',operations:[{id:randomUUID(),type:'add_node',payload:{node:{id:videoId,type:'video-generation',title:'TEST DATA 视频',x:440,y:40,locked:false,data:{kind:'video-generation',draft:{modelId:'seedance',durationSeconds:5,ratio:'9:16',resolution:'480p'},inputBindings:[],stale:true}}}}]}}});
 const draft=(await workspace.call('POST','/studio-api/prompt-drafts',{...h,payload:{type:'video',userRequest:'TEST DATA 5秒，9:16竖屏。',sceneId:'text',requestedSpec:{durationSeconds:5,ratio:'9:16',resolution:'720p'},audioPlan:'',lockedConstraints:[],references:[],ruleVersion:'studio-video-rules-v1',idempotencyKey:randomUUID()}})).json();
 await page.goto('/prompt-generator?draft='+draft.id);await page.getByRole('button',{name:'规则整理',exact:true}).click();await expect(page.getByLabel('结果正文',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'应用到视频草稿',exact:true}).first().click();await page.getByLabel('目标视频草稿',{exact:true}).selectOption(videoId);await page.getByRole('button',{name:'确认应用到云端画布',exact:true}).click();await expect(page.getByRole('dialog',{name:'应用写作结果到画布',exact:true})).not.toBeVisible();
 expect((await workspace.call('GET','/studio-api/projects/'+project.id+'/workspace',h)).json().graph.nodes.find((n:{id:string})=>n.id===videoId).data.draft.resolution).toBe('720p');
 await page.getByRole('button',{name:'创建视频流程',exact:true}).first().click();await expect(page.getByRole('button',{name:'确认应用到云端画布',exact:true})).toBeEnabled();await page.getByRole('button',{name:'确认应用到云端画布',exact:true}).click();await expect(page.getByRole('dialog',{name:'应用写作结果到画布',exact:true})).not.toBeVisible();
 const graph=(await workspace.call('GET','/studio-api/projects/'+project.id+'/workspace',h)).json().graph;
 expect(graph.nodes.filter((n:{type:string})=>n.type==='video-generation').map((n:{data:{draft:{resolution:string}}})=>n.data.draft.resolution)).toEqual(['720p','720p']);expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(0);
});

test('keeps focus and newer typing while an older automatic draft save is in flight',async({page,workspace})=>{
 const h=workspace.headers(workspace.account),draft=(await workspace.call('POST','/studio-api/prompt-drafts',{...h,payload:{type:'video',userRequest:'TEST DATA 初始创意',sceneId:'text',requestedSpec:{},audioPlan:'',lockedConstraints:[],references:[],ruleVersion:'studio-video-rules-v1',idempotencyKey:randomUUID()}})).json();
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});let first=true;
 await page.route('**/studio-api/prompt-drafts/'+draft.id,async route=>{if(route.request().method()==='PATCH'&&first){first=false;await gate;}await route.fallback();});
 try{
  await page.goto('/prompt-generator?draft='+draft.id);const input=page.getByLabel('原始创意',{exact:true});await expect(input).toHaveValue('TEST DATA 初始创意');
  const sent=page.waitForRequest(request=>new URL(request.url()).pathname==='/studio-api/prompt-drafts/'+draft.id&&request.method()==='PATCH');
  await input.fill('TEST DATA 第一段');await sent;await expect(input).toBeFocused();await expect(input).toBeEnabled();
  await input.press('End');await input.pressSequentially('，保存期间继续输入');const expected='TEST DATA 第一段，保存期间继续输入';
  release();await expect(input).toHaveValue(expected);await expect(input).toBeFocused();
  await expect.poll(async()=>(await workspace.call('GET','/studio-api/prompt-drafts/'+draft.id,h)).json().userRequest).toBe(expected);
  await expect(input).toBeFocused();expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(0);
 }finally{release();}
});

test('keeps focused draft input on automatic save failure and saves it only after retry',async({page,workspace})=>{
 const h=workspace.headers(workspace.account),draft=(await workspace.call('POST','/studio-api/prompt-drafts',{...h,payload:{type:'video',userRequest:'TEST DATA 保存失败',sceneId:'text',requestedSpec:{},audioPlan:'',lockedConstraints:[],references:[],ruleVersion:'studio-video-rules-v1',idempotencyKey:randomUUID()}})).json();
 let first=true;await page.route('**/studio-api/prompt-drafts/'+draft.id,async route=>{if(route.request().method()==='PATCH'&&first){first=false;await route.fulfill({status:500,json:{code:'INTERNAL_ERROR'}});}else await route.fallback();});
 await page.goto('/prompt-generator?draft='+draft.id);const input=page.getByLabel('原始创意',{exact:true});await input.fill('TEST DATA 失败时保留的新输入');
 await expect(page.getByRole('alert')).toBeVisible();await expect(input).toBeFocused();await expect(input).toHaveValue('TEST DATA 失败时保留的新输入');
 expect((await workspace.call('GET','/studio-api/prompt-drafts/'+draft.id,h)).json().userRequest).toBe('TEST DATA 保存失败');
 await page.getByRole('button',{name:'重试保存写作输入',exact:true}).click();
 await expect.poll(async()=>(await workspace.call('GET','/studio-api/prompt-drafts/'+draft.id,h)).json().userRequest).toBe('TEST DATA 失败时保留的新输入');
 expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(0);
});

test('waits for an in-flight automatic save before explicitly discarding newer input and reloading',async({page,workspace})=>{
 const h=workspace.headers(workspace.account),draft=(await workspace.call('POST','/studio-api/prompt-drafts',{...h,payload:{type:'video',userRequest:'TEST DATA 云端原值',sceneId:'text',requestedSpec:{},audioPlan:'',lockedConstraints:[],references:[],ruleVersion:'studio-video-rules-v1',idempotencyKey:randomUUID()}})).json();
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});let first=true,readDuringSave=false;
 await page.route('**/studio-api/prompt-drafts',async route=>{if(!first&&route.request().method()==='GET')readDuringSave=true;await route.fallback();});
 await page.route('**/studio-api/prompt-drafts/'+draft.id,async route=>{if(route.request().method()==='PATCH'&&first){first=false;await gate;}await route.fallback();});
 try{
  await page.goto('/prompt-generator?draft='+draft.id);const input=page.getByLabel('原始创意',{exact:true});await expect(input).toHaveValue(draft.userRequest);
  const sent=page.waitForRequest(request=>new URL(request.url()).pathname==='/studio-api/prompt-drafts/'+draft.id&&request.method()==='PATCH');await input.fill('TEST DATA 已发送保存的输入');await sent;await input.fill('TEST DATA 明确放弃的较新输入');
  await page.getByRole('button',{name:'重新加载写作草稿',exact:true}).click();await page.getByRole('button',{name:'放弃输入并重新加载',exact:true}).click();
  // Flush the browser's next tasks while the deliberately held PATCH stays pending.
  await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,200)));expect(readDuringSave).toBe(false);
  release();await expect(input).toHaveValue('TEST DATA 已发送保存的输入');await expect(page.getByRole('status').first()).toContainText('草稿已保存');
  expect((await workspace.call('GET','/studio-api/prompt-drafts/'+draft.id,h)).json().userRequest).toBe('TEST DATA 已发送保存的输入');
 }finally{release();}
});

test('expands the prompt textarea into the remaining height when a cloud text node is enlarged',async({page,workspace})=>{
 const h=workspace.headers(workspace.account),project=(await workspace.call('POST','/studio-api/projects',{...h,payload:{title:'TEST DATA 文本伸展'}})).json(),nodeId=randomUUID();
 await workspace.call('POST','/studio-api/projects/'+project.id+'/commands',{...h,payload:{expectedRevision:0,idempotencyKey:randomUUID(),command:{type:'operations',operations:[{id:randomUUID(),type:'add_node',payload:{node:{id:nodeId,type:'text',title:'TEST DATA 文本',x:40,y:20,locked:false,size:{width:360,height:380},data:{kind:'text',text:'TEST DATA 提示词正文。'.repeat(100),referenceTokens:[]}}}}]}}});
 await page.goto('/projects/'+project.id+'/canvas');const node=page.locator('[data-node-id="'+nodeId+'"]'),input=node.getByLabel('节点文本',{exact:true});await expect(input).toBeVisible();const before=await input.evaluate(el=>el.getBoundingClientRect().height);
 await node.locator('header').click();const handle=page.getByRole('button',{name:'调整节点高度 TEST DATA 文本',exact:true});
 for(let i=0;i<6;i++){await handle.press('Shift+ArrowDown');await expect.poll(async()=>((await workspace.call('GET','/studio-api/projects/'+project.id+'/workspace',h)).json().graph.nodes[0].size.height)).toBe(380+(i+1)*50);}
 const after=await input.evaluate(el=>el.getBoundingClientRect().height);expect(after-before).toBeGreaterThan(290);
 const unused=await node.evaluate(el=>{const b=el.querySelector('.node-body')!.getBoundingClientRect(),e=el.querySelector('.text-node-editor')!.getBoundingClientRect();return b.bottom-e.bottom;});expect(unused).toBeLessThan(25);
 await expect(node.getByLabel('文本字号',{exact:true})).toBeVisible();expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(0);
});

test('accepts a five second video revision timeline at the AI preview without sending a model request',async({page,workspace})=>{
 const h=workspace.headers(workspace.account);await workspace.call('PATCH','/studio-api/me/model-configs/text',{...h,payload:{apiBase:'https://api.example.test',model:'Vendor/Cloud-Text',apiKey:'FAKE_EDIT_REGRESSION_KEY',expectedRevision:null}});
 const prompt='TEST DATA 5秒，9:16竖屏。动作时间轴：0—2秒向前；2—4秒转向；4—5秒停止。';
 const draft=(await workspace.call('POST','/studio-api/prompt-drafts',{...h,payload:{type:'video',userRequest:JSON.stringify({任务:'针对原视频修正错误',原始提示词:prompt,当前完整提示词:prompt,本次修正要求:'TEST DATA 修复车轮形变'}),sceneId:'edit',requestedSpec:{durationSeconds:5,ratio:'9:16'},audioPlan:'',lockedConstraints:[],references:[],ruleVersion:'studio-video-rules-v1',idempotencyKey:randomUUID()}})).json();
 await page.goto('/prompt-generator?draft='+draft.id);await expect(page.getByLabel('原始创意',{exact:true})).toHaveValue(draft.userRequest);await page.getByRole('button',{name:'AI 优化',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'确认 AI 文字优化',exact:true})).toBeVisible();await expect(page.getByRole('alert')).toHaveCount(0);
 expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(0);
});

test('accepts independent appearance times in a video correction at the AI preview',async({page,workspace})=>{
 const h=workspace.headers(workspace.account);await workspace.call('PATCH','/studio-api/me/model-configs/text',{...h,payload:{apiBase:'https://api.example.test',model:'Vendor/Cloud-Text',apiKey:'FAKE_APPEARANCE_TIMING_KEY',expectedRevision:null}});
 const prompt='TEST DATA 5秒，9:16竖屏。动作时间轴：0—2秒向前；2—4秒转向；4—5秒停止。';
 const userRequest=JSON.stringify({任务:'针对原视频修正错误',原始提示词:prompt,当前完整提示词:prompt,本次修正要求:'TEST DATA 猴子大概第二秒进入画面；熊猫坐在路边，大概在3-4秒左右出现。'});
 const draft=(await workspace.call('POST','/studio-api/prompt-drafts',{...h,payload:{type:'video',userRequest,sceneId:'edit',requestedSpec:{durationSeconds:5,ratio:'9:16',resolution:'480p'},audioPlan:'',lockedConstraints:[],references:[],ruleVersion:'studio-video-rules-v1',idempotencyKey:randomUUID()}})).json();
 await page.goto('/prompt-generator?draft='+draft.id);await expect(page.getByLabel('原始创意',{exact:true})).toHaveValue(userRequest);
 const preview=page.waitForResponse(response=>new URL(response.url()).pathname==='/studio-api/prompt-drafts/'+draft.id+'/optimization-preview'&&response.request().method()==='POST');
 await page.getByRole('button',{name:'AI 优化',exact:true}).click();expect((await preview).status()).toBe(201);
 await expect(page.getByRole('dialog',{name:'确认 AI 文字优化',exact:true})).toBeVisible();await expect(page.getByRole('alert')).toHaveCount(0);
 expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(0);expect((await workspace.pool.query('SELECT count(*)::int AS count FROM workspace_tasks')).rows[0].count).toBe(0);
});

test('accepts correction times written after the appearance action at the AI preview',async({page,workspace})=>{
 const h=workspace.headers(workspace.account);await workspace.call('PATCH','/studio-api/me/model-configs/text',{...h,payload:{apiBase:'https://api.example.test',model:'Vendor/Cloud-Text',apiKey:'FAKE_TIMING_ORDER_KEY',expectedRevision:null}});
 const prompt='TEST DATA 5秒，9:16竖屏。动作时间轴：0—2秒向前；2—4秒转向；4—5秒停止。';
 const userRequest=JSON.stringify({任务:'针对原视频修正错误',原始提示词:prompt,当前完整提示词:prompt,本次修正要求:'TEST DATA 主体在对向车道行驶，出现在1-2秒。另一主体坐在路边，出现在3-4秒。'});
 const draft=(await workspace.call('POST','/studio-api/prompt-drafts',{...h,payload:{type:'video',userRequest,sceneId:'edit',requestedSpec:{durationSeconds:5,ratio:'9:16',resolution:'480p'},audioPlan:'',lockedConstraints:[],references:[],ruleVersion:'studio-video-rules-v1',idempotencyKey:randomUUID()}})).json();
 await page.goto('/prompt-generator?draft='+draft.id);await expect(page.getByLabel('原始创意',{exact:true})).toHaveValue(userRequest);
 const preview=page.waitForResponse(response=>new URL(response.url()).pathname==='/studio-api/prompt-drafts/'+draft.id+'/optimization-preview'&&response.request().method()==='POST');
 await page.getByRole('button',{name:'AI 优化',exact:true}).click();expect((await preview).status()).toBe(201);
 await expect(page.getByRole('dialog',{name:'确认 AI 文字优化',exact:true})).toBeVisible();await expect(page.getByRole('alert')).toHaveCount(0);
 expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(0);expect((await workspace.pool.query('SELECT count(*)::int AS count FROM workspace_tasks')).rows[0].count).toBe(0);
});

test('keeps a complete minimap overview fixed while the canvas camera zooms and pans',async({page,workspace})=>{
 const h=workspace.headers(workspace.account),project=(await workspace.call('POST','/studio-api/projects',{...h,payload:{title:'TEST DATA 固定小地图'}})).json();
 const nodes=[{x:-400,y:-300},{x:3200,y:1800}].map((p,i)=>({id:randomUUID(),type:'text',title:'TEST DATA 节点'+i,...p,locked:false,data:{kind:'text',text:'TEST DATA',referenceTokens:[]}}));
 await workspace.call('POST','/studio-api/projects/'+project.id+'/commands',{...h,payload:{expectedRevision:0,idempotencyKey:randomUUID(),command:{type:'operations',operations:nodes.map(node=>({id:randomUUID(),type:'add_node',payload:{node}}))}}});
 await page.goto('/projects/'+project.id+'/canvas');await openCloudToolbarMenu(page,'视图选项');await page.getByRole('button',{name:'显示小地图',exact:true}).click();await openCloudToolbarMenu(page,'视图选项');await page.locator('.toolbar-disclosure > summary').filter({hasText:'视图选项'}).click();
 const map=page.getByLabel('画布小地图',{exact:true});await expect(map).toBeVisible();const before=await map.boundingBox();
 const overview=await map.evaluate(el=>({viewBox:el.getAttribute('viewBox'),nodes:[...el.querySelectorAll('[data-minimap-node]')].map(n=>n.outerHTML)}));
 const bounds=await map.evaluate(el=>{const v=(el as SVGSVGElement).viewBox.baseVal;return {x:v.x,y:v.y,right:v.x+v.width,bottom:v.y+v.height};});
 expect(bounds.x).toBeLessThanOrEqual(-400);expect(bounds.y).toBeLessThanOrEqual(-300);expect(bounds.right).toBeGreaterThanOrEqual(3520);expect(bounds.bottom).toBeGreaterThanOrEqual(2180);
 await expect(map.locator('[data-minimap-viewport]')).toHaveCount(1);
 await page.getByLabel('缩放百分比',{exact:true}).fill('60');await page.getByLabel('缩放百分比',{exact:true}).press('Enter');await expect(page.getByRole('status').first()).toContainText('已保存');
 const stage=(await page.locator('.canvas-stage').boundingBox())!;await page.mouse.move(stage.x+80,stage.y+80);await page.mouse.down({button:'middle'});await page.mouse.move(stage.x+180,stage.y+140,{steps:4});await page.mouse.up({button:'middle'});
 expect(await map.boundingBox()).toEqual(before);expect(await map.evaluate(el=>({viewBox:el.getAttribute('viewBox'),nodes:[...el.querySelectorAll('[data-minimap-node]')].map(n=>n.outerHTML)}))).toEqual(overview);
 expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(0);
});

test('drags the minimap viewport across its edge without moving nodes or changing canvas zoom',async({page,workspace})=>{
 const h=workspace.headers(workspace.account),project=(await workspace.call('POST','/studio-api/projects',{...h,payload:{title:'TEST DATA 小地图拖动'}})).json();
 const nodes=[{x:40,y:40},{x:2000,y:1200}].map((p,i)=>({id:randomUUID(),type:'text',title:'TEST DATA 节点'+i,...p,locked:false,data:{kind:'text',text:'TEST DATA',referenceTokens:[]}}));
 await workspace.call('POST','/studio-api/projects/'+project.id+'/commands',{...h,payload:{expectedRevision:0,idempotencyKey:randomUUID(),command:{type:'operations',operations:nodes.map(node=>({id:randomUUID(),type:'add_node',payload:{node}}))}}});
 await page.goto('/projects/'+project.id+'/canvas');await openCloudToolbarMenu(page,'视图选项');await page.getByRole('button',{name:'显示小地图',exact:true}).click();await page.locator('.toolbar-disclosure > summary').filter({hasText:'视图选项'}).click();
 const map=page.getByLabel('画布小地图',{exact:true}),frame=map.locator('[data-minimap-viewport]');await expect(frame).toBeVisible();const box=(await frame.boundingBox())!,mapBox=(await map.boundingBox())!;
 const before=(await workspace.call('GET','/studio-api/projects/'+project.id+'/workspace',h)).json().graph;
 const transform=await page.locator('.canvas-world').getAttribute('style');
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(mapBox.x+mapBox.width+30,mapBox.y+mapBox.height/2,{steps:6});
 expect(await page.locator('.canvas-world').getAttribute('style')).not.toBe(transform);await expect(page.locator('.selection-box')).toHaveCount(0);await page.mouse.up();
 await expect(page.getByRole('status').first()).toContainText('已保存');const after=(await workspace.call('GET','/studio-api/projects/'+project.id+'/workspace',h)).json().graph;
 expect(after.nodes).toEqual(before.nodes);expect(after.viewport.scale).toBe(before.viewport.scale);expect(after.viewport.x).toBeLessThan(before.viewport.x);
 await page.reload();await expect(page.getByRole('status').first()).toContainText('已保存');expect((await workspace.call('GET','/studio-api/projects/'+project.id+'/workspace',h)).json().graph.viewport).toEqual(after.viewport);
 expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(0);
});
