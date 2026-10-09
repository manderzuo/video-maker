import {randomUUID} from 'node:crypto';
import {test,expect} from '../helpers/cloud-workspace-ui-fixture';
type Ctx={headers(account:unknown):Record<string,string>;call(method:string,path:string,options?:unknown):Promise<{json:()=>unknown;statusCode:number}>;pool:{query(text:string,values?:unknown[]):Promise<{rows:{n?:number}[]}>};account:{view:{user:{id:string}}}};
const asCtx=(value:unknown)=>value as Ctx;
async function seedProject(value:unknown,title:string){
 const ctx=asCtx(value),headers=ctx.headers(ctx.account);
 const project=(await ctx.call('POST','/studio-api/projects',{...headers,payload:{title}})).json() as {id:string};
 const textId=randomUUID(),nodeId=randomUUID();
 expect((await ctx.call('POST','/studio-api/projects/'+project.id+'/commands',{...headers,payload:{expectedRevision:0,idempotencyKey:randomUUID(),command:{type:'operations',operations:[{id:randomUUID(),type:'add_node',payload:{node:{id:textId,type:'text',title:'搜索节点灯塔',x:40,y:40,locked:false,data:{kind:'text',text:'搜索用的正文',referenceTokens:[]}}}},{id:randomUUID(),type:'add_node',payload:{node:{id:nodeId,type:'video-generation',title:'视频草稿',x:440,y:40,locked:false,data:{kind:'video-generation',draft:{modelId:'seedance',durationSeconds:5,ratio:'16:9',resolution:'480p'},inputBindings:[],stale:true}}}}]}}})).statusCode).toBe(200);
 return {projectId:project.id,nodeId:textId};
}
test('searches owned projects, nodes and prompts and follows the hits',async({page,workspace})=>{
 const {projectId,nodeId}=await seedProject(workspace,'搜索目标项目');
 await page.goto('/prompts');await page.getByRole('button',{name:'新建提示词',exact:true}).click();
 await page.getByLabel('提示词名称',{exact:true}).fill('搜索提示词灯塔');await page.getByLabel('提示词正文',{exact:true}).fill('搜索用的正文');await page.getByLabel('提示词来源',{exact:true}).fill('搜索测试');await page.getByRole('button',{name:'保存提示词',exact:true}).click();
 await expect(page.getByRole('heading',{name:'搜索提示词灯塔',exact:true})).toBeVisible();
 await page.goto('/projects');const search=page.getByLabel('全局搜索',{exact:true});
 await search.fill('搜索目标项目');await expect(page.locator('[data-interaction-id="account:search:hit"]')).toContainText('搜索目标项目');
 await search.fill('灯塔');
 const hits=page.locator('[data-interaction-id="account:search:hit"]');
 await expect(hits.filter({hasText:'提示词'})).toContainText('搜索提示词灯塔');
 await expect(hits.filter({hasText:'节点'})).toContainText('搜索节点灯塔');
 await hits.filter({hasText:'节点'}).click();
 await expect(page).toHaveURL(new RegExp('/projects/'+projectId+'/canvas\\?node='+nodeId));
 await expect(page.locator('article[data-node-id="'+nodeId+'"].selected')).toHaveCount(1);
 await page.goto('/projects');await page.getByLabel('全局搜索',{exact:true}).fill('灯塔');
 await page.locator('[data-interaction-id="account:search:hit"]').filter({hasText:'提示词'}).click();
 await expect(page).toHaveURL(/\/prompts\?q=/);
 await expect(page.getByRole('heading',{name:'搜索提示词灯塔',exact:true})).toBeVisible();
 await page.goto('/projects');await page.getByLabel('全局搜索',{exact:true}).fill('灯塔');
 await expect(page.locator('[data-interaction-id="account:search:hit"]').first()).toBeVisible();
 await page.getByRole('button',{name:'清除搜索',exact:true}).click();
 await expect(page.locator('[data-interaction-id="account:search:hit"]')).toHaveCount(0);
});
test('opens the command palette, filters and navigates',async({page})=>{
 await page.goto('/projects');
 await page.getByRole('button',{name:'命令面板',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'命令面板',exact:true});
 await dialog.locator('[data-interaction-id="account:palette:query"]').fill('活动');
 await dialog.getByRole('button',{name:'前往活动',exact:true}).click();
 await expect(page).toHaveURL(/\/activity$/);
 await page.keyboard.press('ControlOrMeta+k');
 await expect(page.getByRole('dialog',{name:'命令面板',exact:true})).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(page.getByRole('dialog',{name:'命令面板',exact:true})).toHaveCount(0);
});
test('reports saved-but-untested configs as unverified, never as connected',async({page,workspace})=>{
 const headers=workspace.headers(workspace.account);
 const revision=async(channel:string)=>((await workspace.call('GET','/studio-api/me/model-configs',{...headers})).json() as {configs:{channel:string;revision:number}[]}).configs.find(config=>config.channel===channel)?.revision??null;
 await page.goto('/projects');
 await expect(page.getByRole('button',{name:/未配置/,exact:false}).first()).toBeVisible();
 // 仅保存、未经任何探测：必须标未验证，不得标已连接/已核验。
 // 注：新地址保存强制要求密钥（服务端 API_KEY_REQUIRED），无密钥的已存配置
 // 经公开接口不可达，故此处不设无密钥分支。
 expect((await workspace.call('PATCH','/studio-api/me/model-configs/text',{...headers,payload:{apiBase:'https://api.example.test',model:'Vendor/Outside-Catalog',apiKey:'FAKE_CLOUD_UI_KEY',expectedRevision:null}})).statusCode).toBe(200);
 // 无合同地址：规格无从核验，只能是已配置·未验证。
 expect((await workspace.call('PATCH','/studio-api/me/model-configs/video',{...headers,payload:{apiBase:'https://video-unverified.example.test',model:'seedance',apiKey:'FAKE_VIDEO_UI_KEY',expectedRevision:await revision('video')}})).statusCode).toBe(200);
 await page.reload();
 const status=page.getByRole('button',{name:/已配置/,exact:false}).first();
 await expect(status).toContainText('文字已配置·未验证');
 await expect(status).toContainText('视频已配置·未验证');
 await expect(status).not.toContainText('已连接');
 await expect(status).not.toContainText('已核验');
 // 切回已核验合同地址：与当前配置绑定的真实核验才显示；仍不得出现已连接。
 expect((await workspace.call('PATCH','/studio-api/me/model-configs/video',{...headers,payload:{apiBase:'https://video.example.test',model:'seedance',apiKey:'FAKE_VIDEO_UI_KEY',expectedRevision:await revision('video')}})).statusCode).toBe(200);
 await page.reload();
 await expect(page.getByRole('button',{name:/视频规格已核验/,exact:false}).first()).toBeVisible();
 await expect(page.getByRole('button',{name:/视频规格已核验/,exact:false}).first()).not.toContainText('已连接');
 // 配置改到无合同地址后，旧核验不得残留。
 expect((await workspace.call('PATCH','/studio-api/me/model-configs/video',{...headers,payload:{apiBase:'https://video-unverified.example.test',model:'seedance',apiKey:'FAKE_VIDEO_UI_KEY',expectedRevision:await revision('video')}})).statusCode).toBe(200);
 await page.reload();
 // 配置改到无合同地址后，旧核验不得残留。
 expect((await workspace.call('PATCH','/studio-api/me/model-configs/video',{...headers,payload:{apiBase:'https://video-unverified.example.test',model:'seedance',apiKey:'FAKE_VIDEO_UI_KEY',expectedRevision:await revision('video')}})).statusCode).toBe(200);
 await page.reload();
 const stale=page.getByRole('button',{name:/已配置/,exact:false}).first();
 await expect(stale).toContainText('视频已配置·未验证');
 await expect(stale).not.toContainText('已核验');
 await stale.click();
 const dialog=page.getByRole('dialog',{name:'连接详情',exact:true});
 await expect(dialog).toContainText('https://video-unverified.example.test');
 await expect(dialog).toContainText('不代表连接探测成功');
 await dialog.getByRole('link',{name:'配置模型连接',exact:true}).click();
 await expect(page).toHaveURL(/\/settings\/connections$/);
});
test('lists failed runs as notifications without sending requests',async({page,workspace})=>{
 const headers=workspace.headers(workspace.account);
 expect((await workspace.call('PATCH','/studio-api/me/model-configs/video',{...headers,payload:{apiBase:'https://video.example.test',model:'seedance',apiKey:'FAKE_VIDEO_UI_KEY',expectedRevision:null}})).statusCode).toBe(200);
 await page.goto('/projects');
 await page.getByRole('button',{name:'通知',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'通知消息',exact:true})).toContainText('暂无需要处理的事项');
 await page.getByRole('button',{name:'关闭',exact:true}).click();
 workspace.setVideoOutcome('failed');
 const textId=randomUUID(),nodeId=randomUUID();
 const project=(await workspace.call('POST','/studio-api/projects',{...headers,payload:{title:'通知检查'}})).json() as {id:string};
 await workspace.call('POST','/studio-api/projects/'+project.id+'/commands',{...headers,payload:{expectedRevision:0,idempotencyKey:randomUUID(),command:{type:'operations',operations:[{id:randomUUID(),type:'add_node',payload:{node:{id:textId,type:'text',title:'创意',x:40,y:40,locked:false,data:{kind:'text',text:'通知用的正文',referenceTokens:[]}}}},{id:randomUUID(),type:'add_node',payload:{node:{id:nodeId,type:'video-generation',title:'视频草稿',x:440,y:40,locked:false,data:{kind:'video-generation',draft:{modelId:'seedance',durationSeconds:5,ratio:'16:9',resolution:'480p'},inputBindings:[],stale:true}}}},{id:randomUUID(),type:'add_edge',payload:{edge:{id:randomUUID(),sourceId:textId,targetId:nodeId,port:'text',order:0}}}]}}});
 await page.goto('/projects/'+project.id+'/canvas');
 await page.getByLabel('本次视频草稿',{exact:true}).selectOption(nodeId);
 await page.getByRole('button',{name:'生成视频',exact:true}).click();
 await page.getByLabel('我确认所列视频生成可能收费',{exact:true}).check();
 await page.getByRole('button',{name:'确认生成',exact:true}).click();
 await expect.poll(async()=>(await workspace.pool.query("SELECT document->>'executionState' state FROM workspace_video_runs")).rows[0]?.state).toBe('failed_confirmed');
 await page.getByRole('button',{name:'通知',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'通知消息',exact:true});
 await expect(dialog).toContainText('视频生成未完成');
 await dialog.getByRole('link',{name:'前往处理',exact:true}).click();
 await expect(page).toHaveURL(/\/tasks$/);
 expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(1);
});
test('renders help with cloud-scoped guidance and working links',async({page})=>{
 await page.goto('/help');
 await expect(page.getByText('按账号隔离保存云端',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'第三方许可与来源',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'第三方许可与来源',exact:true})).toContainText('画布逻辑许可');
 await page.getByRole('button',{name:'关闭',exact:true}).click();
 await page.getByRole('link',{name:'恢复中心',exact:true}).click();
 await expect(page).toHaveURL(/\/recovery$/);
});
