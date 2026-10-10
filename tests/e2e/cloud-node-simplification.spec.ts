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
 await expect(page.locator('.selection-box')).toHaveCount(0);
 await expect(page.locator('.node-asset .node-body button')).toHaveCount(0);
});
