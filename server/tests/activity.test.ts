import {afterEach,beforeEach,expect,it} from 'vitest';
import {fixture,type Fixture} from './account-fixture.js';
import {randomUUID} from 'node:crypto';
let env:Fixture;
beforeEach(async()=>{env=await fixture({workspace:true,content:true});});
afterEach(async()=>{await env?.close();});
it('records successful and failed account operations, classifies projects and excludes request bodies',async()=>{
 const account=await env.signup('Activity_A'),h=env.headers(account),project=(await env.call('POST','/studio-api/projects',{...h,payload:{title:'操作项目',description:'PRIVATE_PROMPT_BODY'}})).json();
 await env.call('PATCH','/studio-api/projects/'+project.id,{...h,payload:{expectedRevision:0,title:'新名称'}});
 expect((await env.call('PATCH','/studio-api/projects/'+project.id,{...h,payload:{expectedRevision:0,title:'冲突'}})).statusCode).toBe(409);
 const response=await env.call('GET','/studio-api/activity?projectId='+project.id,h);expect(response.statusCode).toBe(200);
 expect(response.json().items).toHaveLength(3);expect(response.json().items.map((item:{status:number})=>item.status).sort()).toEqual([200,201,409]);
 expect(response.body).not.toContain('PRIVATE_PROMPT_BODY');expect(response.body).not.toContain(h.csrf);expect(response.body).not.toContain(account.cookie);
 const other=await env.signup('Activity_B');expect((await env.call('GET','/studio-api/activity?projectId='+project.id,env.headers(other))).json().items).toEqual([]);
});
it('paginates stable timestamps without repeats or omitted operations',async()=>{
 const account=await env.signup('Activity_Pages'),h=env.headers(account);
 for(let n=0;n<7;n++)expect((await env.call('POST','/studio-api/projects',{...h,payload:{title:'分页'+n}})).statusCode).toBe(201);
 let cursor:string|null=null;const ids:string[]=[];
 do{const response=await env.call('GET','/studio-api/activity?limit=2'+(cursor?'&cursor='+encodeURIComponent(cursor):''),h);expect(response.statusCode).toBe(200);const page=response.json();ids.push(...page.items.map((item:{id:string})=>item.id));cursor=page.nextCursor;}while(cursor);
 expect(ids).toHaveLength(7);expect(new Set(ids).size).toBe(7);
 expect((await env.call('GET','/studio-api/activity?cursor=not-json',h)).statusCode).toBe(400);
});
it('keeps public writing and rejected commands in their owned activity classification',async()=>{
 const account=await env.signup('Activity_Public'),h=env.headers(account);
 await env.call('POST','/studio-api/prompt-drafts',{...h,payload:{type:'video',userRequest:'SECRET_TEXT',sceneId:'text',requestedSpec:{},audioPlan:'',lockedConstraints:[],references:[],ruleVersion:'studio-video-rules-v1',idempotencyKey:randomUUID()}});
 const response=await env.call('GET','/studio-api/activity?unassigned=true',h);expect(response.statusCode).toBe(200);expect(response.json().items).toHaveLength(1);expect(response.json().items[0].projectId).toBeNull();expect(response.body).not.toContain('SECRET_TEXT');
});
it('records the same command identity independently for two accounts without breaking either command',async()=>{
 const a=await env.signup('Activity_Identity_A'),b=await env.signup('Activity_Identity_B'),key=randomUUID();
 for(const account of [a,b]){const h=env.headers(account),project=(await env.call('POST','/studio-api/projects',{...h,payload:{title:'隔离项目'}})).json();const response=await env.call('POST','/studio-api/projects/'+project.id+'/commands',{...h,payload:{expectedRevision:0,idempotencyKey:key,command:{type:'operations',operations:[{id:randomUUID(),type:'add_node',payload:{node:{id:randomUUID(),type:'text',title:'文字',x:0,y:0,locked:false,data:{kind:'text',text:'账号独立文字',referenceTokens:[]}}}}]}}});expect(response.statusCode).toBe(200);const rows=(await env.call('GET','/studio-api/activity?projectId='+project.id,h)).json().items;expect(rows.some((row:{id:string})=>row.id===key)).toBe(true);}
});
it('classifies canvas writing under its source project and supports full Unicode project names',async()=>{
 const account=await env.signup('Activity_Source'),h=env.headers(account),title='🎬'.repeat(60),nodeId=randomUUID();
 const project=(await env.call('POST','/studio-api/projects',{...h,payload:{title}})).json();
 expect((await env.call('POST','/studio-api/projects/'+project.id+'/commands',{...h,payload:{expectedRevision:0,idempotencyKey:randomUUID(),command:{type:'operations',operations:[{id:randomUUID(),type:'add_node',payload:{node:{id:nodeId,type:'text',title:'源文字',x:0,y:0,locked:false,data:{kind:'text',text:'原文字',referenceTokens:[]}}}}]}}})).statusCode).toBe(200);
 expect((await env.call('POST','/studio-api/prompt-drafts',{...h,payload:{type:'video',userRequest:'原文字',sceneId:'text',sourceProjectId:project.id,sourceNodeId:nodeId,sourceRevision:1,requestedSpec:{},audioPlan:'',lockedConstraints:[],references:[],ruleVersion:'studio-video-rules-v1',idempotencyKey:randomUUID()}})).statusCode).toBe(201);
 const response=await env.call('GET','/studio-api/activity?projectId='+project.id,h);expect(response.statusCode).toBe(200);expect(response.json().items).toHaveLength(3);expect(response.json().items.every((row:{projectTitle:string})=>row.projectTitle===title)).toBe(true);
});
