import {randomUUID} from 'node:crypto';
import {test,expect} from '../helpers/cloud-workspace-ui-fixture';

test.beforeEach(async({page})=>{
 await page.addInitScript(()=>{const open=indexedDB.open.bind(indexedDB);Object.defineProperty(window,'__localDbOpens',{value:[],writable:true});indexedDB.open=((...args:Parameters<IDBFactory['open']>)=>{(window as unknown as {__localDbOpens:string[]}).__localDbOpens.push(args[0]);return open(...args);}) as IDBFactory['open'];});
});

test('compact text card connects a cloud flow through ports and restores text after reload',async({page,workspace},testInfo)=>{
 await page.setViewportSize({width:1920,height:1080});
 const h=workspace.headers(workspace.account);
 await workspace.call('PATCH','/studio-api/me/model-configs/video',{...h,payload:{apiBase:'https://video.example.test',model:'seedance',apiKey:'FAKE_VIDEO_UI_KEY',expectedRevision:null}});
 const project=(await workspace.call('POST','/studio-api/projects',{...h,payload:{title:'原工作台文字流程'}})).json();
 await page.goto('/projects/'+project.id+'/canvas');
 await page.getByRole('button',{name:'添加文字节点',exact:true}).click();
 const text=page.locator('.text-node-editor');
 await text.getByRole('textbox',{name:'节点文本',exact:true}).fill('只绑定这段原始提示词');
 await text.getByRole('combobox',{name:'文本字号'}).selectOption('20');
 await expect(text.getByRole('textbox',{name:'节点文本'})).toHaveCSS('font-size','20px');
 await page.getByRole('button',{name:'添加节点',exact:true}).click();
 await page.getByRole('button',{name:'添加视频草稿',exact:true}).click();
 await page.getByRole('button',{name:'输出文本',exact:true}).press('Enter');
 await page.getByRole('button',{name:'接收文本',exact:true}).click();
 await expect(page.locator('.node-video-generation')).toHaveCount(1);
 await expect(page.locator('.canvas-wire')).toHaveCount(1);
 await expect(page.getByRole('status').first()).toContainText('已保存');
 await page.reload();
 await expect(page.locator('.text-node-editor textarea')).toHaveValue('只绑定这段原始提示词');
 const graph=(await workspace.pool.query('SELECT graph FROM workspace_graphs WHERE project_id=$1',[project.id])).rows[0].graph;
 expect(graph.nodes).toHaveLength(2);expect(graph.edges).toHaveLength(1);
 expect(graph.edges[0].port).toBe('text');
 await page.getByRole('button',{name:'适配全部',exact:true}).click();
 const cards=page.locator('.canvas-node');
 for(const card of await cards.all()){
  const title=await card.getByRole('textbox',{name:'节点标题',exact:true}).boundingBox();
  for(const port of await card.locator('.port-label').all()){
   const label=await port.boundingBox();
   expect(title&&label&&(title.x>=label.x+label.width||title.y>=label.y+label.height||title.x+title.width<=label.x||title.y+title.height<=label.y)).toBeTruthy();
  }
 }
 await expect(text.locator('button')).toHaveCount(0);
 await page.screenshot({path:testInfo.outputPath('restored-original-canvas.png'),fullPage:true});
 expect(await page.evaluate(()=>(window as unknown as {__localDbOpens:string[]}).__localDbOpens)).toEqual([]);
 expect(workspace.providerCalls.filter(c=>c.method==='POST')).toHaveLength(0);
});

test('original video card opens confirmation for its explicit node with unchanged requested spec',async({page,workspace})=>{
 const h=workspace.headers(workspace.account);
 await workspace.call('PATCH','/studio-api/me/model-configs/video',{...h,payload:{apiBase:'https://video.example.test',model:'seedance',apiKey:'FAKE_VIDEO_UI_KEY',expectedRevision:null}});
 const project=(await workspace.call('POST','/studio-api/projects',{...h,payload:{title:'卡片生成目标'}})).json();
 const textId=randomUUID(),first=randomUUID(),second=randomUUID();
 const nodes=[{id:textId,type:'text',title:'明确文字',x:40,y:40,locked:false,data:{kind:'text',text:'指定第二个草稿的正文',referenceTokens:[]}},...[first,second].map((id,index)=>({id,type:'video-generation',title:'草稿'+(index+1),x:410+index*380,y:40,locked:false,data:{kind:'video-generation',draft:{modelId:'seedance',durationSeconds:5,ratio:'16:9',resolution:'480p'},inputBindings:[],stale:true}}))];
 const operations=[...nodes.map(node=>({id:randomUUID(),type:'add_node',payload:{node}})),{id:randomUUID(),type:'add_edge',payload:{edge:{id:randomUUID(),sourceId:textId,targetId:second,port:'text',order:0}}}];
 expect((await workspace.call('POST','/studio-api/projects/'+project.id+'/commands',{...h,payload:{expectedRevision:0,idempotencyKey:randomUUID(),command:{type:'operations',operations}}})).statusCode).toBe(200);
 await page.goto('/projects/'+project.id+'/canvas');
 await page.getByRole('button',{name:'适配全部',exact:true}).click();
 const card=page.locator('[data-node-id="'+second+'"]');
 await expect(card.locator('[data-interaction-id="V-02"]')).toHaveValue('5');
 await card.locator('[data-interaction-id="V-08"]').click();
 const confirmation=page.getByRole('dialog',{name:'确认云端视频生成'});
 await expect(confirmation).toBeVisible();
 await expect(confirmation.getByRole('heading',{name:'草稿2',exact:true})).toBeVisible();
 await expect(confirmation.getByRole('heading',{name:'草稿1',exact:true})).toHaveCount(0);
 await expect(confirmation.locator('pre')).toContainText('指定第二个草稿的正文');
 expect(workspace.providerCalls.filter(c=>c.method==='POST')).toHaveLength(0);
});

test('original shell canvas entry and node menu delete only a confirmed cloud node',async({page,workspace})=>{
 const h=workspace.headers(workspace.account);await workspace.call('POST','/studio-api/projects',{...h,payload:{title:'原导航与菜单'}});
 await page.goto('/canvas');
 await expect(page.getByRole('navigation',{name:'主导航'})).toBeVisible();
 await page.getByRole('link',{name:'原导航与菜单',exact:true}).click();
 await page.getByRole('button',{name:'添加文字节点',exact:true}).click();
 await page.locator('.text-node-editor textarea').fill('保留正文');
 await expect(page.getByRole('status').first()).toContainText('已保存');
 await page.getByRole('button',{name:'删除选中节点',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'删除节点',exact:true})).toBeVisible();
 await expect(page.locator('.node-text')).toHaveCount(1);
 await page.getByRole('dialog',{name:'删除节点'}).getByRole('button',{name:'确认删除节点'}).click();
 await expect(page.locator('.node-text')).toHaveCount(0);
 await page.reload();await expect(page.locator('.node-text')).toHaveCount(0);
 expect(await page.evaluate(()=>(window as unknown as {__localDbOpens:string[]}).__localDbOpens)).toEqual([]);
 expect(workspace.providerCalls.filter(c=>c.method==='POST')).toHaveLength(0);
});

test('node prompt generation stays docked in the original canvas and preserves its source binding',async({page,workspace})=>{
 const h=workspace.headers(workspace.account),project=(await workspace.call('POST','/studio-api/projects',{...h,payload:{title:'画布内写作'}})).json();
 await page.goto('/projects/'+project.id+'/canvas');await page.getByRole('button',{name:'添加文字节点',exact:true}).click();
 await page.locator('.text-node-editor textarea').fill('原节点写作内容');
 await page.locator('.node-text header').click();
 await page.getByRole('button',{name:'提示词生成面板',exact:true}).click();
 await expect(page).toHaveURL(new RegExp('/projects/'+project.id+'/canvas$'));
 await expect(page.locator('.prompt-generator-panel')).toBeVisible();
 await expect(page.locator('.prompt-generator-panel textarea').first()).toHaveValue('原节点写作内容');
 const drafts=(await workspace.call('GET','/studio-api/prompt-drafts',h)).json();
 expect(drafts).toHaveLength(1);expect(drafts[0].sourceProjectId).toBe(project.id);
 expect(drafts[0].sourceNodeId).toBeTruthy();expect(drafts[0].userRequest).toBe('原节点写作内容');
 expect(workspace.providerCalls.filter(c=>c.method==='POST')).toHaveLength(0);
});

test('invalid oversized node input stays on canvas until corrected rather than silently disappearing',async({page,workspace})=>{
 const h=workspace.headers(workspace.account),project=(await workspace.call('POST','/studio-api/projects',{...h,payload:{title:'过长输入保留'}})).json();
 await page.goto('/projects/'+project.id+'/canvas');await page.getByRole('button',{name:'添加文字节点',exact:true}).click();
 await expect(page.getByRole('status').first()).toContainText('已保存');
 const value='字'.repeat(22000);await page.locator('.text-node-editor textarea').fill(value);
 await expect(page.locator('.text-node-editor').getByRole('alert')).toContainText('64KiB');
 await page.getByRole('navigation',{name:'主导航'}).getByRole('link',{name:'项目',exact:true}).click();
 await expect(page).toHaveURL(new RegExp('/projects/'+project.id+'/canvas$'));
 await expect(page.locator('.text-node-editor textarea')).toHaveValue(value);
 await page.locator('.text-node-editor textarea').fill('恢复有效内容');
 await expect(page.getByRole('status').first()).toContainText('已保存');
 await page.reload();await expect(page.locator('.text-node-editor textarea')).toHaveValue('恢复有效内容');
 expect(workspace.providerCalls.filter(c=>c.method==='POST')).toHaveLength(0);
});

test('original asset preview uses private cloud media without opening the anonymous local database',async({page,workspace})=>{
 const project=(await workspace.call('POST','/studio-api/projects',{...workspace.headers(workspace.account),payload:{title:'云端原素材卡片'}})).json();
 await page.goto('/projects/'+project.id+'/canvas');await page.getByRole('button',{name:'添加节点',exact:true}).click();
 const png=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=8;return canvas.toDataURL('image/png').split(',')[1];});
 await page.locator('[data-interaction-id="cloud:asset:picker-files"]').setInputFiles({name:'原卡片.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
 await page.getByRole('button',{name:'上传到云端素材库',exact:true}).click();await page.getByRole('button',{name:'选择此素材',exact:true}).click();
 await expect(page.locator('.node-asset img')).toBeVisible();
 await expect(page.locator('.node-asset img')).toHaveAttribute('src',/original$/);
 await expect(page.locator('.node-asset .node-body button')).toHaveCount(0);
 expect(await page.evaluate(()=>(window as unknown as {__localDbOpens:string[]}).__localDbOpens)).toEqual([]);
 expect(workspace.providerCalls.filter(c=>c.method==='POST')).toHaveLength(0);
});


test('original agent address and the canvas prompt button open their usable panels without supplier calls',async({page,workspace})=>{
 const project=(await workspace.call('POST','/studio-api/projects',{...workspace.headers(workspace.account),payload:{title:'原工作台面板入口'}})).json();
 await page.goto('/projects/'+project.id+'/agent');
 await expect(page.getByRole('button',{name:'新建 Agent 会话',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'提示词生成面板',exact:true}).click();
 await expect(page.locator('.prompt-generator-panel')).toBeVisible();
 await expect(page.getByRole('button',{name:'新建视频写作草稿',exact:true})).toBeVisible();
 expect(workspace.providerCalls.filter(c=>c.method==='POST')).toHaveLength(0);
});

test('canvas selection keeps the card body in place and exposes usable edge resize handles',async({page,workspace},testInfo)=>{
 const h=workspace.headers(workspace.account),project=(await workspace.call('POST','/studio-api/projects',{...h,payload:{title:'点击节点显示回归'}})).json();
 const id=randomUUID();
 expect((await workspace.call('POST','/studio-api/projects/'+project.id+'/commands',{...h,payload:{expectedRevision:0,idempotencyKey:randomUUID(),command:{type:'operations',operations:[{id:randomUUID(),type:'add_node',payload:{node:{id,type:'text',title:'选中尺寸',x:64,y:64,locked:false,data:{kind:'text',text:'点击前后正文位置保持稳定',referenceTokens:[]}}}}]}}})).statusCode).toBe(200);
 await page.goto('/projects/'+project.id+'/canvas');
 const card=page.locator('[data-node-id="'+id+'"]'),body=card.locator('.node-body');
 await expect(card).toBeVisible();
 const before=await body.boundingBox();if(!before)throw Error('Missing unselected node body');
 await card.locator('header').click();
 await expect(card).toHaveClass(/selected/);
 const after=await body.boundingBox(),bounds=await card.boundingBox(),corner=await card.getByRole('button',{name:'调整节点大小 选中尺寸',exact:true}).boundingBox();
 if(!after||!bounds||!corner)throw Error('Missing selected card bounds');
 await page.screenshot({path:testInfo.outputPath('canvas-click-selection.png'),fullPage:true});
 await testInfo.attach('selection-layout',{body:JSON.stringify({before,after,bounds,corner}),contentType:'application/json'});
 expect.soft(Math.abs(after.y-before.y),'Selecting a node must not push its editor downward').toBeLessThanOrEqual(2);
 expect.soft(Math.abs(corner.x+corner.width/2-(bounds.x+bounds.width)),'Corner grip must sit on the right edge').toBeLessThanOrEqual(2);
 expect.soft(Math.abs(corner.y+corner.height/2-(bounds.y+bounds.height)),'Corner grip must sit on the bottom edge').toBeLessThanOrEqual(2);
 expect.soft(corner.width,'Grip must provide a 28px pointer target').toBeCloseTo(28,0);
 await expect(card.locator('textarea')).toHaveValue('点击前后正文位置保持稳定');
 expect(workspace.providerCalls).toHaveLength(0);
});

test('mouse corner resize changes both dimensions and persists one undoable cloud command',async({page,workspace},testInfo)=>{
 const h=workspace.headers(workspace.account),project=(await workspace.call('POST','/studio-api/projects',{...h,payload:{title:'鼠标拖动尺寸'}})).json(),id=randomUUID();
 expect((await workspace.call('POST','/studio-api/projects/'+project.id+'/commands',{...h,payload:{expectedRevision:0,idempotencyKey:randomUUID(),command:{type:'operations',operations:[{id:randomUUID(),type:'add_node',payload:{node:{id,type:'text',title:'拖动尺寸',x:64,y:64,locked:false,data:{kind:'text',text:'正文不会随调整尺寸改变',referenceTokens:[]}}}}]}}})).statusCode).toBe(200);
 await page.goto('/projects/'+project.id+'/canvas');
 const card=page.locator('[data-node-id="'+id+'"]');await card.locator('header').click();
 const grip=await card.getByRole('button',{name:'调整节点大小 拖动尺寸',exact:true}).boundingBox();if(!grip)throw Error('Missing corner grip');
 await page.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2);await page.mouse.down();await page.mouse.move(grip.x+grip.width/2+80,grip.y+grip.height/2+50,{steps:8});await page.mouse.up();
 await expect(card).toHaveCSS('width','400px');await expect(card).toHaveCSS('height','430px');
 await expect(page.getByRole('status').first()).toContainText('已保存');
 const read=async()=>(await workspace.pool.query('SELECT graph FROM workspace_graphs WHERE project_id=$1',[project.id])).rows[0].graph;
 const resized=await read();expect(resized.revision).toBe(2);expect(resized.nodes[0].size).toEqual({width:400,height:430});expect(resized.nodes[0].data.text).toBe('正文不会随调整尺寸改变');
 await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(card).toHaveCSS('width','320px');await expect(card).toHaveCSS('height','380px');
 await expect(page.getByRole('status').first()).toContainText('已保存');
 await page.getByRole('button',{name:'重做',exact:true}).click();await expect(card).toHaveCSS('width','400px');await expect(page.getByRole('status').first()).toContainText('已保存');
 await page.reload();await expect(card).toHaveCSS('width','400px');await expect(card).toHaveCSS('height','430px');await expect(card.locator('textarea')).toHaveValue('正文不会随调整尺寸改变');
 await card.locator('header').click();await page.screenshot({path:testInfo.outputPath('canvas-mouse-resize.png'),fullPage:true});
 expect(workspace.providerCalls).toHaveLength(0);
});

test('canvas resize hit targets retain screen size at half zoom and drag by world dimensions',async({page,workspace})=>{
 const h=workspace.headers(workspace.account),project=(await workspace.call('POST','/studio-api/projects',{...h,payload:{title:'缩放下尺寸手柄'}})).json(),id=randomUUID();
 expect((await workspace.call('POST','/studio-api/projects/'+project.id+'/commands',{...h,payload:{expectedRevision:0,idempotencyKey:randomUUID(),command:{type:'operations',operations:[{id:randomUUID(),type:'add_node',payload:{node:{id,type:'text',title:'半倍缩放',x:64,y:64,locked:false,data:{kind:'text',text:'按世界坐标调整',referenceTokens:[]}}}}],viewport:{x:0,y:0,scale:.5}}}})).statusCode).toBe(200);
 await page.goto('/projects/'+project.id+'/canvas');const card=page.locator('[data-node-id="'+id+'"]');await card.locator('header').click();
 const grip=await card.getByRole('button',{name:'调整节点大小 半倍缩放',exact:true}).boundingBox();if(!grip)throw Error('Missing half-zoom grip');
 expect(grip.width).toBeCloseTo(28,0);expect(grip.height).toBeCloseTo(28,0);
 await page.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2);await page.mouse.down();await page.mouse.move(grip.x+grip.width/2+40,grip.y+grip.height/2+25,{steps:8});await page.mouse.up();
 await expect(card).toHaveCSS('width','400px');await expect(card).toHaveCSS('height','430px');await expect(page.getByRole('status').first()).toContainText('已保存');
 const graph=(await workspace.pool.query('SELECT graph FROM workspace_graphs WHERE project_id=$1',[project.id])).rows[0].graph;
 expect(graph.nodes[0].size).toEqual({width:400,height:430});expect(graph.viewport.scale).toBe(.5);expect(workspace.providerCalls).toHaveLength(0);
});

test('portrait image preview grows with mouse node resize instead of leaving an empty frame',async({page,workspace},testInfo)=>{
 const kind='image' as 'image'|'video';
 await page.setViewportSize({width:1920,height:1440});await page.goto('/assets');
 const bytes=await page.evaluate(async kind=>{
  const c=document.createElement('canvas');c.width=180;c.height=320;const ctx=c.getContext('2d')!;ctx.fillStyle='#1d6da4';ctx.fillRect(0,0,180,160);ctx.fillStyle='#46d7b6';ctx.fillRect(0,160,180,160);ctx.fillStyle='white';ctx.font='20px sans-serif';ctx.fillText('Portrait 9:16',20,100);
  if(kind==='image')return [...new Uint8Array(await (await new Promise<Blob>(resolve=>c.toBlob(b=>resolve(b!),'image/png'))).arrayBuffer())];
  const stream=c.captureStream(15),parts:Blob[]=[];const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8'});recorder.ondataavailable=e=>parts.push(e.data);await new Promise<void>(resolve=>{recorder.onstart=()=>resolve();recorder.start();});let tick=0;const paint=setInterval(()=>{ctx.fillStyle=++tick%2?"#1d6da4":"#46d7b6";ctx.fillRect(0,0,2,2);},30);await new Promise(resolve=>setTimeout(resolve,600));clearInterval(paint);await new Promise<void>(resolve=>{recorder.onstop=()=>resolve();recorder.stop();});stream.getTracks().forEach(t=>t.stop());return [...new Uint8Array(await new Blob(parts,{type:'video/webm'}).arrayBuffer())];
 },kind);
 const title='竖屏尺寸.'+(kind==='image'?'png':'webm');
 await page.getByLabel('选择素材文件',{exact:true}).setInputFiles({name:title,mimeType:kind==='image'?'image/png':'video/webm',buffer:Buffer.from(bytes)});await page.getByRole('button',{name:'上传到云端',exact:true}).click();await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();
 const h=workspace.headers(workspace.account),asset=(await workspace.call('GET','/studio-api/assets',h)).json().find((a:{title:string})=>a.title===title),project=(await workspace.call('POST','/studio-api/projects',{...h,payload:{title:'竖屏预览调整'}})).json(),id=randomUUID();
 expect(asset).toBeTruthy();expect((await workspace.call('POST','/studio-api/projects/'+project.id+'/commands',{...h,payload:{expectedRevision:0,idempotencyKey:randomUUID(),command:{type:'operations',operations:[{id:randomUUID(),type:'add_node',payload:{node:{id,type:'asset',title:'竖屏预览',x:64,y:64,size:{width:480,height:660},locked:false,data:{kind:'asset',assetId:asset.id}}}}],viewport:{x:0,y:0,scale:1}}}})).statusCode).toBe(200);
 await page.goto('/projects/'+project.id+'/canvas');const card=page.locator('[data-node-id="'+id+'"]'),media=card.locator('.canvas-asset-preview '+(kind==='image'?'img':'video'));
 await expect.poll(()=>media.evaluate(el=>el instanceof HTMLVideoElement?el.videoHeight: (el as HTMLImageElement).naturalHeight)).toBeGreaterThan(0);
 expect(await media.evaluate(el=>el instanceof HTMLVideoElement?el.videoWidth/el.videoHeight:(el as HTMLImageElement).naturalWidth/(el as HTMLImageElement).naturalHeight)).toBeCloseTo(9/16,2);
 await card.locator('header').click();const before=await media.boundingBox(),grip=await card.getByRole('button',{name:'调整节点大小 竖屏预览',exact:true}).boundingBox();if(!before||!grip)throw Error('Missing media or corner');
 await page.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2);await page.mouse.down();await page.mouse.move(grip.x+grip.width/2+120,grip.y+grip.height/2+160,{steps:8});
 const during=await media.boundingBox();await page.mouse.up();await expect(page.getByRole('status').first()).toContainText('已保存');
 const after=await media.boundingBox(),frame=await card.locator('.canvas-asset-preview').boundingBox();if(!after||!frame||!during)throw Error('Missing resized preview');
 await page.screenshot({path:testInfo.outputPath('portrait-'+kind+'-resized.png'),fullPage:true});await testInfo.attach('media-resize-bounds',{body:JSON.stringify({before,during,after,frame}),contentType:'application/json'});
 expect.soft(during.height-before.height,'Preview must grow during pointer movement').toBeGreaterThan(140);expect.soft(after.height-before.height,'Saved preview must grow with node height').toBeGreaterThan(140);expect.soft(Math.abs(frame.height-after.height),'Media must use its full preview frame').toBeLessThanOrEqual(2);await expect(media).toHaveCSS('object-fit','contain');
 expect(await card.locator('.node-body').evaluate(el=>el.scrollHeight-el.clientHeight)).toBeLessThanOrEqual(2);
 await page.reload();await expect(media).toBeVisible();await expect.poll(async()=>((await media.boundingBox())?.height??0)).toBeGreaterThan(before.height+140);
 const graph=(await workspace.pool.query('SELECT graph FROM workspace_graphs WHERE project_id=$1',[project.id])).rows[0].graph;expect(graph.nodes[0].size).toEqual({width:600,height:820});expect(graph.nodes[0].data.assetId).toBe(asset.id);expect(workspace.providerCalls).toHaveLength(0);
});

test('portrait video preview grows with mouse node resize instead of leaving an empty frame',async({page,workspace},testInfo)=>{
 const kind='video' as 'image'|'video';
 await page.setViewportSize({width:1920,height:1440});await page.goto('/assets');
 const bytes=await page.evaluate(async kind=>{
  const c=document.createElement('canvas');c.width=180;c.height=320;const ctx=c.getContext('2d')!;ctx.fillStyle='#1d6da4';ctx.fillRect(0,0,180,160);ctx.fillStyle='#46d7b6';ctx.fillRect(0,160,180,160);ctx.fillStyle='white';ctx.font='20px sans-serif';ctx.fillText('Portrait 9:16',20,100);
  if(kind==='image')return [...new Uint8Array(await (await new Promise<Blob>(resolve=>c.toBlob(b=>resolve(b!),'image/png'))).arrayBuffer())];
  const stream=c.captureStream(15),parts:Blob[]=[];const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8'});recorder.ondataavailable=e=>parts.push(e.data);await new Promise<void>(resolve=>{recorder.onstart=()=>resolve();recorder.start();});let tick=0;const paint=setInterval(()=>{ctx.fillStyle=++tick%2?"#1d6da4":"#46d7b6";ctx.fillRect(0,0,2,2);},30);await new Promise(resolve=>setTimeout(resolve,600));clearInterval(paint);await new Promise<void>(resolve=>{recorder.onstop=()=>resolve();recorder.stop();});stream.getTracks().forEach(t=>t.stop());return [...new Uint8Array(await new Blob(parts,{type:'video/webm'}).arrayBuffer())];
 },kind);
 const title='竖屏尺寸.'+(kind==='image'?'png':'webm');
 await page.getByLabel('选择素材文件',{exact:true}).setInputFiles({name:title,mimeType:kind==='image'?'image/png':'video/webm',buffer:Buffer.from(bytes)});await page.getByRole('button',{name:'上传到云端',exact:true}).click();await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();
 const h=workspace.headers(workspace.account),asset=(await workspace.call('GET','/studio-api/assets',h)).json().find((a:{title:string})=>a.title===title),project=(await workspace.call('POST','/studio-api/projects',{...h,payload:{title:'竖屏预览调整'}})).json(),id=randomUUID();
 expect(asset).toBeTruthy();expect((await workspace.call('POST','/studio-api/projects/'+project.id+'/commands',{...h,payload:{expectedRevision:0,idempotencyKey:randomUUID(),command:{type:'operations',operations:[{id:randomUUID(),type:'add_node',payload:{node:{id,type:'asset',title:'竖屏预览',x:64,y:64,size:{width:480,height:660},locked:false,data:{kind:'asset',assetId:asset.id}}}}],viewport:{x:0,y:0,scale:1}}}})).statusCode).toBe(200);
 await page.goto('/projects/'+project.id+'/canvas');const card=page.locator('[data-node-id="'+id+'"]'),media=card.locator('.canvas-asset-preview '+(kind==='image'?'img':'video'));
 await expect.poll(()=>media.evaluate(el=>el instanceof HTMLVideoElement?el.videoHeight: (el as HTMLImageElement).naturalHeight)).toBeGreaterThan(0);
 expect(await media.evaluate(el=>el instanceof HTMLVideoElement?el.videoWidth/el.videoHeight:(el as HTMLImageElement).naturalWidth/(el as HTMLImageElement).naturalHeight)).toBeCloseTo(9/16,2);
 await card.locator('header').click();const before=await media.boundingBox(),grip=await card.getByRole('button',{name:'调整节点大小 竖屏预览',exact:true}).boundingBox();if(!before||!grip)throw Error('Missing media or corner');
 await page.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2);await page.mouse.down();await page.mouse.move(grip.x+grip.width/2+120,grip.y+grip.height/2+160,{steps:8});
 const during=await media.boundingBox();await page.mouse.up();await expect(page.getByRole('status').first()).toContainText('已保存');
 const after=await media.boundingBox(),frame=await card.locator('.canvas-asset-preview').boundingBox();if(!after||!frame||!during)throw Error('Missing resized preview');
 await page.screenshot({path:testInfo.outputPath('portrait-'+kind+'-resized.png'),fullPage:true});await testInfo.attach('media-resize-bounds',{body:JSON.stringify({before,during,after,frame}),contentType:'application/json'});
 expect.soft(during.height-before.height,'Preview must grow during pointer movement').toBeGreaterThan(140);expect.soft(after.height-before.height,'Saved preview must grow with node height').toBeGreaterThan(140);expect.soft(Math.abs(frame.height-after.height),'Media must use its full preview frame').toBeLessThanOrEqual(2);await expect(media).toHaveCSS('object-fit','contain');
 expect(await card.locator('.node-body').evaluate(el=>el.scrollHeight-el.clientHeight)).toBeLessThanOrEqual(2);
 await page.reload();await expect(media).toBeVisible();await expect.poll(async()=>((await media.boundingBox())?.height??0)).toBeGreaterThan(before.height+140);
 const graph=(await workspace.pool.query('SELECT graph FROM workspace_graphs WHERE project_id=$1',[project.id])).rows[0].graph;expect(graph.nodes[0].size).toEqual({width:600,height:820});expect(graph.nodes[0].data.assetId).toBe(asset.id);expect(workspace.providerCalls).toHaveLength(0);
});
