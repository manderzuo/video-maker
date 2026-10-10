import {randomUUID} from 'node:crypto';
import {test,expect} from '../helpers/cloud-workspace-ui-fixture';

test('offers only 5 through 15 seconds and 480p or 720p while retaining an old out of range draft',async({page,workspace})=>{
 workspace.setVideoSpecs(Array.from({length:15},(_,index)=>index+2).flatMap(durationSeconds=>['480p','720p','1080p'].map(resolution=>({modelId:'seedance',durationSeconds,ratio:'16:9',resolution}))));
 const h=workspace.headers(workspace.account);await workspace.call('PATCH','/studio-api/me/model-configs/video',{...h,payload:{apiBase:'https://video.example.test',model:'seedance',apiKey:'FAKE_VIDEO_UI_KEY',expectedRevision:null}});
 const project=(await workspace.call('POST','/studio-api/projects',{...h,payload:{title:'旧规格不静默改写'}})).json();
 const nodeId=randomUUID();await workspace.call('POST','/studio-api/projects/'+project.id+'/commands',{...h,payload:{expectedRevision:0,idempotencyKey:randomUUID(),command:{type:'operations',operations:[{id:randomUUID(),type:'add_node',payload:{node:{id:nodeId,type:'video-generation',title:'旧草稿',x:40,y:40,locked:false,data:{kind:'video-generation',draft:{modelId:'seedance',durationSeconds:2,ratio:'16:9',resolution:'1080p'},inputBindings:[],stale:true}}}}]}}});
 await page.goto('/projects/'+project.id+'/canvas');const draft=page.locator('.node-video-generation');
 await expect(draft.locator('[data-interaction-id="V-02"]')).toHaveValue('2');await expect(draft.locator('[data-interaction-id="V-04"]')).toHaveValue('1080p');
 expect(await draft.locator('[data-interaction-id="V-02"] option').allTextContents()).toEqual(['原值 2 · 待核验',...Array.from({length:11},(_,index)=>String(index+5))]);
 expect(await draft.locator('[data-interaction-id="V-04"] option').allTextContents()).toEqual(['原值 1080p · 待核验','480p','720p']);
 await draft.locator('[data-interaction-id="V-02"]').selectOption('15');await draft.locator('[data-interaction-id="V-04"]').selectOption('720p');await page.getByRole('button',{name:'保存到云端',exact:true}).click();
 await expect.poll(async()=>((await workspace.call('GET','/studio-api/projects/'+project.id+'/workspace',h)).json().graph.nodes[0].data.draft)).toEqual({modelId:'seedance',durationSeconds:15,ratio:'16:9',resolution:'720p'});
 expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(0);
});

test('keeps cloud text and draft cards compact and pans with the middle mouse without moving nodes',async({page,workspace})=>{
 const h=workspace.headers(workspace.account),project=(await workspace.call('POST','/studio-api/projects',{...h,payload:{title:'精简节点和中键'}})).json();
 await workspace.call('PATCH','/studio-api/me/model-configs/video',{...h,payload:{apiBase:'https://video.example.test',model:'seedance',apiKey:'FAKE_VIDEO_UI_KEY',expectedRevision:null}});
 await page.goto('/projects/'+project.id+'/canvas');
 await page.getByRole('button',{name:'添加文字节点',exact:true}).click();
 await page.getByRole('button',{name:'添加节点',exact:true}).click();
 await page.locator('[data-interaction-id="cloud:canvas:dialog-model"]').fill('seedance');
 await page.getByRole('button',{name:'添加视频草稿',exact:true}).click();
 await expect(page.getByRole('status').first()).toContainText('已保存');
 await expect(page.locator('.node-text .node-body button')).toHaveCount(0);
 await expect(page.locator('.node-video-generation .node-body button')).toHaveCount(1);
 const original=(await workspace.call('GET','/studio-api/projects/'+project.id+'/workspace',h)).json().graph;
 const box=(await page.locator('.canvas-stage').boundingBox())!;
 await page.mouse.move(box.x+30,box.y+30);await page.mouse.down({button:'middle'});await page.mouse.move(box.x+150,box.y+100,{steps:6});await page.mouse.up({button:'middle'});
 await page.getByRole('button',{name:'保存到云端',exact:true}).click();
 await expect.poll(async()=>((await workspace.call('GET','/studio-api/projects/'+project.id+'/workspace',h)).json().graph.viewport.x)).toBe(original.viewport.x+120);
 const saved=(await workspace.call('GET','/studio-api/projects/'+project.id+'/workspace',h)).json().graph;
 expect(saved.nodes).toEqual(original.nodes);expect(saved.viewport.y).toBe(original.viewport.y+70);
 expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(0);
});

test('lets the native canvas video play button receive real pointer input',async({page,workspace},testInfo)=>{
 await page.goto('/projects');
 const bytes=Buffer.from(await page.evaluate(async()=>{
  const canvas=document.createElement('canvas');canvas.width=80;canvas.height=120;
  const context=canvas.getContext('2d')!;context.fillStyle='#2ca';context.fillRect(0,0,80,120);
  const stream=canvas.captureStream(20),chunks:BlobPart[]=[];
  const recorder=new MediaRecorder(stream,{mimeType:'video/webm'});recorder.ondataavailable=event=>chunks.push(event.data);
  const stopped=new Promise<void>(resolve=>{recorder.onstop=()=>resolve();});
  await new Promise<void>(resolve=>{recorder.onstart=()=>resolve();recorder.start();});
  const timer=setInterval(()=>{context.fillStyle='#2ca';context.fillRect(0,0,80,120);},30);
  await new Promise(resolve=>setTimeout(resolve,900));recorder.stop();await stopped;clearInterval(timer);stream.getTracks().forEach(track=>track.stop());
  return Array.from(new Uint8Array(await new Blob(chunks,{type:'video/webm'}).arrayBuffer()));
 }));
 const h=workspace.headers(workspace.account),digest=(await import('node:crypto')).createHash('sha256').update(bytes).digest('hex');
 const asset=(await workspace.call('POST','/studio-api/assets',{...h,payload:{title:'真实播放器.webm',mimeType:'video/webm',bytes:bytes.length,sha256:digest}})).json();
 expect((await workspace.app.inject({method:'PUT',url:'/studio-api/assets/'+asset.id+'/content',payload:bytes,headers:{cookie:h.cookie,'x-workspace-context':h.context,'x-csrf-token':h.csrf,origin:'https://studio.test','content-type':'application/octet-stream'}})).statusCode).toBe(204);
 await workspace.call('POST','/studio-api/assets/'+asset.id+'/complete',{...h,payload:{}});
 const project=(await workspace.call('POST','/studio-api/projects',{...h,payload:{title:'播放器交互'}})).json();
 await workspace.call('POST','/studio-api/projects/'+project.id+'/commands',{...h,payload:{expectedRevision:0,idempotencyKey:randomUUID(),command:{type:'operations',operations:[{id:randomUUID(),type:'add_node',payload:{node:{id:randomUUID(),type:'asset',title:'播放器',x:30,y:30,size:{width:400,height:440},locked:false,data:{kind:'asset',assetId:asset.id}}}}]}}});
 await page.goto('/projects/'+project.id+'/canvas');const video=page.locator('.node-asset video');
 await expect.poll(()=>video.evaluate(element=>(element as HTMLVideoElement).readyState)).toBeGreaterThanOrEqual(2);
 expect(await video.evaluate(element=>getComputedStyle(element).pointerEvents)).toBe('auto');
 await video.evaluate(element=>element.addEventListener('play',()=>{(element as HTMLElement).dataset.played='true';}));
 const box=(await video.boundingBox())!;await page.mouse.move(box.x+24,box.y+box.height-48);
 await page.screenshot({path:testInfo.outputPath('native-player-before-click.png')});
 await page.mouse.click(box.x+24,box.y+box.height-48);
 await expect(video).toHaveAttribute('data-played','true');
 await video.click({position:{x:100,y:50}});await expect(page.locator('.node-asset')).toHaveClass(/selected/);
 await expect(page.locator('.selection-box')).toHaveCount(0);
 await expect(page.locator('.node-asset .node-body button')).toHaveCount(0);
});

test('selects every node card through its body and preserves text editor focus',async({page,workspace},testInfo)=>{
 await page.setViewportSize({width:1920,height:1280});
 const h=workspace.headers(workspace.account),textId=randomUUID(),videoId=randomUUID();
 await workspace.call('PATCH','/studio-api/me/model-configs/video',{...h,payload:{apiBase:'https://video.example.test',model:'seedance',apiKey:'FAKE_VIDEO_UI_KEY',expectedRevision:null}});
 const project=(await workspace.call('POST','/studio-api/projects',{...h,payload:{title:'整张节点可选中'}})).json();
 expect((await workspace.call('POST','/studio-api/projects/'+project.id+'/commands',{...h,payload:{expectedRevision:0,idempotencyKey:randomUUID(),command:{type:'operations',operations:[{id:randomUUID(),type:'add_node',payload:{node:{id:textId,type:'text',title:'正文选择',x:40,y:40,size:{width:320,height:380},locked:false,data:{kind:'text',text:'卡片任意位置可选中',referenceTokens:[]}}}},{id:randomUUID(),type:'add_node',payload:{node:{id:videoId,type:'video-generation',title:'草稿选择',x:400,y:40,size:{width:320,height:380},locked:false,data:{kind:'video-generation',draft:{modelId:'seedance',durationSeconds:5,ratio:'16:9',resolution:'480p'},inputBindings:[],stale:true}}}},{id:randomUUID(),type:'add_edge',payload:{edge:{id:randomUUID(),sourceId:textId,targetId:videoId,port:'text',order:0}}}]}}})).statusCode).toBe(200);
 await page.goto('/projects/'+project.id+'/canvas');await page.locator('[data-interaction-id="V-08"]').click();
 await page.getByRole('button',{name:'确认',exact:true}).click();
 const read=async()=>(await workspace.call('GET','/studio-api/projects/'+project.id+'/workspace',h)).json().graph;
 await expect.poll(async()=>(await read()).nodes.filter((node:{type:string})=>node.type==='result').length,{timeout:15000}).toBe(1);
 const completed=await read(),result=completed.nodes.find((node:{type:string})=>node.type==='result'),assetId=randomUUID(),groupId=randomUUID();
 expect((await workspace.call('POST','/studio-api/projects/'+project.id+'/commands',{...h,payload:{expectedRevision:completed.revision,idempotencyKey:randomUUID(),command:{type:'operations',operations:[{id:randomUUID(),type:'move_node',payload:{nodeId:result.id,x:40,y:470}},{id:randomUUID(),type:'update_node',payload:{nodeId:result.id,patch:{size:{width:320,height:380}}}},{id:randomUUID(),type:'add_node',payload:{node:{id:assetId,type:'asset',title:'素材选择',x:760,y:40,size:{width:320,height:380},locked:false,data:{kind:'asset',assetId:result.data.assetId}}}},{id:randomUUID(),type:'add_node',payload:{node:{id:groupId,type:'group',title:'分组选择',x:400,y:470,locked:false,data:{kind:'group',childIds:[],collapsed:false}}}}]}}})).statusCode).toBe(200);
 await page.reload();await expect(page.locator('.canvas-node')).toHaveCount(5);
 const before=await read(),stage=page.locator('.canvas-stage');
 for(const id of [textId,videoId,assetId,result.id,groupId]){
  const stageBox=(await stage.boundingBox())!;await stage.click({position:{x:stageBox.width-8,y:stageBox.height-8}});
  const card=page.locator('[data-node-id="'+id+'"]'),body=card.locator('.node-body'),box=(await body.boundingBox())!;
  const cardBox=(await card.boundingBox())!;await card.click({position:{x:5,y:box.y-cardBox.y+box.height-8}});
  await expect(card).toHaveClass(/selected/);await expect(page.locator('.canvas-node.selected')).toHaveCount(1);
  await expect(page.locator('.selection-box')).toHaveCount(0);
 }
 expect(await read()).toEqual(before);
 const group=page.locator('[data-node-id="'+groupId+'"]');await group.getByRole('button',{name:'取消选中',exact:true}).click();await expect(group).not.toHaveClass(/selected/);
 await group.getByRole('button',{name:'选中节点',exact:true}).click();await expect(group).toHaveClass(/selected/);
 const editor=page.locator('[data-node-id="'+textId+'"] textarea');await editor.click();
 await expect(page.locator('[data-node-id="'+textId+'"]')).toHaveClass(/selected/);await expect(editor).toBeFocused();
 await editor.fill('正文编辑仍正常');await expect(editor).toHaveValue('正文编辑仍正常');await expect(editor).toBeFocused();
 await page.screenshot({path:testInfo.outputPath('whole-card-selected.png'),fullPage:true});
 expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(1);
});

test('body shift selection and repeated body drags preserve the selected node group',async({page,workspace})=>{
 const h=workspace.headers(workspace.account),project=(await workspace.call('POST','/studio-api/projects',{...h,payload:{title:'正文选中和拖动'}})).json(),ids=[randomUUID(),randomUUID()];
 expect((await workspace.call('POST','/studio-api/projects/'+project.id+'/commands',{...h,payload:{expectedRevision:0,idempotencyKey:randomUUID(),command:{type:'operations',operations:ids.map((id,index)=>({id:randomUUID(),type:'add_node',payload:{node:{id,type:'text',title:'节点'+index,x:40+index*360,y:40,locked:false,data:{kind:'text',text:'保留多选',referenceTokens:[]}}}}))}}})).statusCode).toBe(200);
 await page.goto('/projects/'+project.id+'/canvas');
 const bodies=ids.map(id=>page.locator('[data-node-id="'+id+'"] .node-body'));
 const clickBody=async(index:number,shift=false)=>{const box=(await bodies[index].boundingBox())!;await bodies[index].click({position:{x:5,y:box.height-8},modifiers:shift?['Shift']:[]});};
 await clickBody(0);await clickBody(1,true);await expect(page.locator('.canvas-node.selected')).toHaveCount(2);
 for(let turn=1;turn<=2;turn++){
  const box=(await bodies[0].boundingBox())!;await page.mouse.move(box.x+5,box.y+box.height-8);await page.mouse.down();await page.mouse.move(box.x+35,box.y+box.height+12,{steps:6});await page.mouse.up();
  await expect(page.getByRole('status').first()).toContainText('已保存');await expect(page.locator('.canvas-node.selected')).toHaveCount(2);
  await expect.poll(async()=>((await workspace.call('GET','/studio-api/projects/'+project.id+'/workspace',h)).json().graph.nodes.map((node:{x:number;y:number})=>({x:node.x,y:node.y})))).toEqual([{x:40+turn*30,y:40+turn*20},{x:400+turn*30,y:40+turn*20}]);
 }
 await clickBody(1,true);await expect(page.locator('[data-node-id="'+ids[1]+'"]')).not.toHaveClass(/selected/);
 expect(workspace.providerCalls).toHaveLength(0);
});
