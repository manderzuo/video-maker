import {randomUUID} from 'node:crypto';
import {test,expect} from '../helpers/cloud-workspace-ui-fixture';

test.beforeEach(async({page})=>{
 await page.addInitScript(()=>{const open=indexedDB.open.bind(indexedDB);Object.defineProperty(window,'__localDbOpens',{value:[],writable:true});indexedDB.open=((...args:Parameters<IDBFactory['open']>)=>{(window as unknown as {__localDbOpens:string[]}).__localDbOpens.push(args[0]);return open(...args);}) as IDBFactory['open'];});
});

test('original text card creates a connected cloud flow and restores text after reload',async({page,workspace},testInfo)=>{
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
 await text.getByRole('button',{name:'从文本创建视频流程',exact:true}).click();
 await page.getByRole('dialog',{name:'从文本创建视频流程'}).getByRole('button',{name:'确认仅创建草稿'}).click();
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
 await text.getByRole('button',{name:'复制文本',exact:true}).scrollIntoViewIfNeeded();
 expect(await text.getByRole('button',{name:'复制文本',exact:true}).evaluate(button=>{const rect=button.getBoundingClientRect();return button.contains(document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2));})).toBe(true);
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
 await page.locator('.text-node-editor').getByRole('button',{name:'提示词生成',exact:true}).click();
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
 await page.locator('.canvas-asset-content').getByRole('button',{name:'预览素材',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'素材预览'}).getByRole('img',{name:'原卡片.png'})).toBeVisible();
 await expect(page.getByRole('dialog',{name:'素材预览'}).getByRole('img',{name:'原卡片.png'})).toHaveAttribute('src',/original$/);
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
