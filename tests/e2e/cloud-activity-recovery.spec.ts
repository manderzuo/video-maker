import {randomUUID} from 'node:crypto';
import {test,expect} from '../helpers/cloud-workspace-ui-fixture';
type Ctx={headers(account:unknown):Record<string,string>;call(method:string,path:string,options?:unknown):Promise<{json:()=>unknown;statusCode:number}>;account:{view:{user:{id:string}}}};
const asCtx=(value:unknown)=>value as Ctx;
async function seedProject(value:unknown,title:string){
 const ctx=asCtx(value),headers=ctx.headers(ctx.account);
 const project=(await ctx.call('POST','/studio-api/projects',{...headers,payload:{title}})).json() as {id:string};
 const textId=randomUUID();
 expect((await ctx.call('POST','/studio-api/projects/'+project.id+'/commands',{...headers,payload:{expectedRevision:0,idempotencyKey:randomUUID(),command:{type:'operations',operations:[{id:randomUUID(),type:'add_node',payload:{node:{id:textId,type:'text',title:'活动正文',x:40,y:40,locked:false,data:{kind:'text',text:'活动用的正文',referenceTokens:[]}}}}]}}})).statusCode).toBe(200);
 return project.id;
}
test('lists recent command receipts across projects with canvas links',async({page,workspace})=>{
 const first=await seedProject(workspace,'活动项目甲'),second=await seedProject(workspace,'活动项目乙');
 const headers=workspace.headers(workspace.account);
 const textId=randomUUID();
 expect((await workspace.call('POST','/studio-api/projects/'+first+'/commands',{...headers,payload:{expectedRevision:1,idempotencyKey:randomUUID(),command:{type:'operations',operations:[{id:randomUUID(),type:'add_node',payload:{node:{id:textId,type:'text',title:'第二笔',x:40,y:520,locked:false,data:{kind:'text',text:'第二笔正文',referenceTokens:[]}}}}]}}})).statusCode).toBe(200);
 await page.goto('/activity');
 const rows=page.locator('article');
 await expect(rows.filter({hasText:'活动项目甲'})).toHaveCount(2);
 await expect(rows.filter({hasText:'活动项目乙'})).toHaveCount(1);
 await expect(page.getByText('修订 2',{exact:false}).first()).toBeVisible();
 await rows.filter({hasText:'活动项目乙'}).getByRole('link',{name:'打开项目画布',exact:true}).click();
 await expect(page).toHaveURL(new RegExp('/projects/'+second+'/canvas$'));
 await page.goto('/activity');
 await page.getByRole('button',{name:'重新读取',exact:true}).click();
 await expect(rows.filter({hasText:'活动项目甲'})).toHaveCount(2);
});
test('shows an empty activity page when the account has no commands',async({page})=>{
 await page.goto('/activity');
 await expect(page.getByText('暂无云端操作记录',{exact:false})).toBeVisible();
});
test('surfaces unknown and failed runs for recovery without sending requests',async({page,workspace})=>{
 const headers=workspace.headers(workspace.account);
 expect((await workspace.call('PATCH','/studio-api/me/model-configs/video',{...headers,payload:{apiBase:'https://video.example.test',model:'seedance',apiKey:'FAKE_VIDEO_UI_KEY',expectedRevision:null}})).statusCode).toBe(200);
 workspace.setVideoOutcome('unknown');
 const textId=randomUUID(),nodeId=randomUUID();
 const project=(await workspace.call('POST','/studio-api/projects',{...headers,payload:{title:'恢复检查'}})).json() as {id:string};
 await workspace.call('POST','/studio-api/projects/'+project.id+'/commands',{...headers,payload:{expectedRevision:0,idempotencyKey:randomUUID(),command:{type:'operations',operations:[{id:randomUUID(),type:'add_node',payload:{node:{id:textId,type:'text',title:'创意',x:40,y:40,locked:false,data:{kind:'text',text:'恢复用的正文',referenceTokens:[]}}}},{id:randomUUID(),type:'add_node',payload:{node:{id:nodeId,type:'video-generation',title:'视频草稿',x:440,y:40,locked:false,data:{kind:'video-generation',draft:{modelId:'seedance',durationSeconds:5,ratio:'16:9',resolution:'480p'},inputBindings:[],stale:true}}}},{id:randomUUID(),type:'add_edge',payload:{edge:{id:randomUUID(),sourceId:textId,targetId:nodeId,port:'text',order:0}}}]}}});
 await page.goto('/projects/'+project.id+'/canvas');
 await page.getByLabel('本次视频草稿',{exact:true}).selectOption(nodeId);
 await page.getByRole('button',{name:'生成视频',exact:true}).click();
 await page.getByLabel('我确认所列视频生成可能收费',{exact:true}).check();
 await page.getByRole('button',{name:'确认生成',exact:true}).click();
 await expect.poll(async()=>(await workspace.pool.query("SELECT document->>'executionState' state FROM workspace_video_runs")).rows[0]?.state).toBe('submit_unknown');
 const posts=workspace.providerCalls.filter(call=>call.method==='POST').length;
 await page.goto('/recovery');
 await expect(page.getByText('视频提交结果未知',{exact:false})).toBeVisible();
 await page.getByRole('link',{name:'前往处理',exact:true}).click();
 await expect(page).toHaveURL(/\/tasks$/);
 await page.goto('/recovery');
 expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(posts);
});
test('shows an empty recovery page when nothing needs attention',async({page})=>{
 await page.goto('/recovery');
 await expect(page.getByText('暂无待处理事项',{exact:false})).toBeVisible();
});
