import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
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
 const rows=page.locator('article').filter({hasText:'画布编辑与保存'});
 await expect(rows.filter({hasText:'活动项目甲'})).toHaveCount(2);
 await expect(rows.filter({hasText:'活动项目乙'})).toHaveCount(1);
 await expect(rows.first()).toBeVisible();
 await rows.filter({hasText:'活动项目乙'}).getByRole('link',{name:'打开项目画布',exact:true}).click();
 await expect(page).toHaveURL(new RegExp('/projects/'+second+'/canvas$'));
 await page.goto('/activity');
 await page.getByRole('button',{name:'重新读取',exact:true}).click();
 await expect(rows.filter({hasText:'活动项目甲'})).toHaveCount(2);
});
test('shows an empty activity page when the account has no commands',async({page})=>{
 await page.goto('/activity');
 await expect(page.getByText('暂无符合分类的操作记录。',{exact:true})).toBeVisible();
});
test('surfaces unknown and failed runs for recovery without sending requests',async({page,workspace})=>{
 const headers=workspace.headers(workspace.account);
 expect((await workspace.call('PATCH','/studio-api/me/model-configs/video',{...headers,payload:{apiBase:'https://video.example.test',model:'seedance',apiKey:'FAKE_VIDEO_UI_KEY',expectedRevision:null}})).statusCode).toBe(200);
 workspace.setVideoOutcome('unknown');
 const textId=randomUUID(),nodeId=randomUUID();
 const project=(await workspace.call('POST','/studio-api/projects',{...headers,payload:{title:'恢复检查'}})).json() as {id:string};
 await workspace.call('POST','/studio-api/projects/'+project.id+'/commands',{...headers,payload:{expectedRevision:0,idempotencyKey:randomUUID(),command:{type:'operations',operations:[{id:randomUUID(),type:'add_node',payload:{node:{id:textId,type:'text',title:'创意',x:40,y:40,locked:false,data:{kind:'text',text:'恢复用的正文',referenceTokens:[]}}}},{id:randomUUID(),type:'add_node',payload:{node:{id:nodeId,type:'video-generation',title:'视频草稿',x:440,y:40,locked:false,data:{kind:'video-generation',draft:{modelId:'seedance',durationSeconds:5,ratio:'16:9',resolution:'480p'},inputBindings:[],stale:true}}}},{id:randomUUID(),type:'add_edge',payload:{edge:{id:randomUUID(),sourceId:textId,targetId:nodeId,port:'text',order:0}}}]}}});
 await page.goto('/projects/'+project.id+'/canvas');
 await page.locator('[data-node-id="'+nodeId+'"] [data-interaction-id="V-08"]').click();

 await page.getByRole('button',{name:'确认',exact:true}).click();
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
test('exports a redacted cloud diagnostics report',async({page,workspace},testInfo)=>{
 const headers=workspace.headers(workspace.account);
 expect((await workspace.call('PATCH','/studio-api/me/model-configs/video',{...headers,payload:{apiBase:'https://video.example.test',model:'seedance',apiKey:'FAKE_VIDEO_UI_KEY',expectedRevision:null}})).statusCode).toBe(200);
 const textId=randomUUID(),nodeId=randomUUID();
 const project=(await workspace.call('POST','/studio-api/projects',{...headers,payload:{title:'诊断导出'}})).json() as {id:string};
 await workspace.call('POST','/studio-api/projects/'+project.id+'/commands',{...headers,payload:{expectedRevision:0,idempotencyKey:randomUUID(),command:{type:'operations',operations:[{id:randomUUID(),type:'add_node',payload:{node:{id:textId,type:'text',title:'创意',x:40,y:40,locked:false,data:{kind:'text',text:'诊断用的正文',referenceTokens:[]}}}},{id:randomUUID(),type:'add_node',payload:{node:{id:nodeId,type:'video-generation',title:'视频草稿',x:440,y:40,locked:false,data:{kind:'video-generation',draft:{modelId:'seedance',durationSeconds:5,ratio:'16:9',resolution:'480p'},inputBindings:[],stale:true}}}},{id:randomUUID(),type:'add_edge',payload:{edge:{id:randomUUID(),sourceId:textId,targetId:nodeId,port:'text',order:0}}}]}}});
 await page.goto('/projects/'+project.id+'/canvas');
 await page.locator('[data-node-id="'+nodeId+'"] [data-interaction-id="V-08"]').click();

 await page.getByRole('button',{name:'确认',exact:true}).click();
 await expect.poll(async()=>(await workspace.pool.query("SELECT document->>'executionState' state FROM workspace_video_runs")).rows[0]?.state,{timeout:15000}).toBe('succeeded');
 await page.goto('/activity');
 // Initial graph save plus the new server-side completed-result placement.
 await expect(page.locator('article').filter({hasText:'诊断导出'}).filter({hasText:'画布编辑与保存'})).toHaveCount(2);
 const downloading=page.waitForEvent('download');
 await page.getByRole('button',{name:'导出脱敏诊断',exact:true}).click();
 const path=testInfo.outputPath('cloud-diagnostics.json');
 await (await downloading).saveAs(path);
 const report=JSON.parse(readFileSync(path,'utf8')) as {format:string;receipts:unknown[];runs:Record<string,unknown>[]};
 expect(report.format).toBe('aiwork-studio-cloud-diagnostics');
 expect(report.receipts.length).toBeGreaterThan(0);
 expect(report.runs[0]).toMatchObject({executionState:'succeeded'});
 expect(report.runs[0]).not.toHaveProperty('inputSnapshot');
 expect(report.runs[0]).not.toHaveProperty('finalBody');
 expect(JSON.stringify(report)).not.toContain('FAKE_VIDEO_UI_KEY');
 expect(JSON.stringify(report)).not.toContain('诊断用的正文');
 await expect(page.getByText('已触发浏览器下载脱敏诊断报告',{exact:false})).toBeVisible();
});
