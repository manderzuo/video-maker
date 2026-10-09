import {randomUUID} from 'node:crypto';
import {beforeEach,afterEach,it,expect} from 'vitest';
import {fixture,type Fixture,type Account} from './account-fixture.js';
let env:Fixture;
beforeEach(async()=>{env=await fixture({workspace:true,content:true});});
afterEach(async()=>{await env?.close();});
const create=(a:Account,input:Record<string,unknown>={},key=randomUUID())=>env.call('POST','/studio-api/prompts',{...env.headers(a),payload:{title:'我的提示词',body:'保留明确的镜头与动作',idempotencyKey:key,...input}});
async function draft(a:Account,extra:Record<string,unknown>={}){
 const r=await env.call('POST','/studio-api/prompt-drafts',{...env.headers(a),payload:{idempotencyKey:randomUUID(),type:'video',userRequest:'拍摄雨后的城市',sceneId:'text',requestedSpec:{durationSeconds:5,ratio:'16:9'},audioPlan:'环境声',lockedConstraints:[],references:[],ruleVersion:'studio-video-rules-v1',...extra}});expect(r.statusCode).toBe(201);return r.json();
}
it('saves, searches, revisions, trashes and restores only the authenticated prompt library',async()=>{
 const a=await env.signup('Prompt_A'),b=await env.signup('Prompt_B'),r=await create(a,{tags:['镜头'],source:'用户创作',license:'自有'});expect(r.statusCode).toBe(201);const p=r.json();expect(p).toMatchObject({revision:0,trashed:false,tags:['镜头']});
 expect((await env.call('GET','/studio-api/prompts',env.headers(b))).json()).toEqual([]);expect((await env.call('GET',`/studio-api/prompts/${p.id}`,env.headers(b))).statusCode).toBe(404);
 const changed=await env.call('PATCH',`/studio-api/prompts/${p.id}`,{...env.headers(a),payload:{expectedRevision:0,body:'第二版正文',starred:true}});expect(changed.statusCode).toBe(200);expect(changed.json()).toMatchObject({revision:1,body:'第二版正文'});
 expect((await env.call('PATCH',`/studio-api/prompts/${p.id}`,{...env.headers(a),payload:{expectedRevision:0,body:'过期覆盖'}})).statusCode).toBe(409);
 expect((await env.call('GET',`/studio-api/prompts/${p.id}/revisions/0`,env.headers(a))).json().body).toBe('保留明确的镜头与动作');
 expect((await env.call('DELETE',`/studio-api/prompts/${p.id}`,{...env.headers(a),payload:{expectedRevision:1}})).statusCode).toBe(200);expect((await env.call('GET','/studio-api/prompts',env.headers(a))).json()).toEqual([]);
 expect((await env.call('GET','/studio-api/prompts?trashed=true',env.headers(a))).json()).toHaveLength(1);
 expect((await env.call('POST',`/studio-api/prompts/${p.id}/restore`,{...env.headers(a),payload:{expectedRevision:2}})).json()).toMatchObject({revision:3,trashed:false});
});
it('makes creation idempotent per user and rejects altered or secret-bearing fields',async()=>{
 const a=await env.signup('Key_A'),b=await env.signup('Key_B'),key=randomUUID(),first=await create(a,{},key);expect(first.statusCode).toBe(201);
 expect((await create(a,{},key)).json().id).toBe(first.json().id);expect((await create(b,{},key)).statusCode).toBe(201);expect((await create(a,{body:'不相同'},key)).statusCode).toBe(409);expect((await create(a,{apiKey:'FAKE_DO_NOT_SAVE'})).statusCode).toBe(400);
});
it('stores complete draft input and immutable historical versions and refuses foreign source projects',async()=>{
 const a=await env.signup('Draft_A'),b=await env.signup('Draft_B'),p=(await env.call('POST','/studio-api/projects',{...env.headers(a),payload:{title:'源项目'}})).json();
 expect((await env.call('POST','/studio-api/prompt-drafts',{...env.headers(b),payload:{idempotencyKey:randomUUID(),type:'video',userRequest:'非法来源',sceneId:'text',requestedSpec:{},audioPlan:'',lockedConstraints:[],references:[],ruleVersion:'studio-video-rules-v1',sourceProjectId:p.id}})).statusCode).toBe(404);
 const d=await draft(a,{sourceProjectId:p.id});expect(d.resultVersions).toEqual([]);
 const changed=await env.call('PATCH',`/studio-api/prompt-drafts/${d.id}`,{...env.headers(a),payload:{expectedRevision:0,userRequest:'新创意'}});expect(changed.statusCode).toBe(200);
 expect((await env.call('GET',`/studio-api/prompt-drafts/${d.id}/revisions/0`,env.headers(a))).json().userRequest).toBe('拍摄雨后的城市');expect((await env.call('GET',`/studio-api/prompt-drafts/${d.id}`,env.headers(b))).statusCode).toBe(404);
});
it('compiles local video writing on the server and retains result versions through later draft edits',async()=>{
 const a=await env.signup(),d=await draft(a),compiled=await env.call('POST',`/studio-api/prompt-drafts/${d.id}/compile`,{...env.headers(a),payload:{expectedRevision:0}});expect(compiled.statusCode).toBe(200);
 const next=compiled.json();expect(next.revision).toBe(1);expect(next.resultVersions).toHaveLength(1);expect(next.resultVersions[0]).toMatchObject({origin:'local',sourceRevision:0});expect(next.resultVersions[0].finalPrompt).toContain('雨后的城市');
 expect((await env.call('PATCH',`/studio-api/prompt-drafts/${d.id}`,{...env.headers(a),payload:{expectedRevision:1,userRequest:'第二个创意'}})).json().resultVersions).toEqual(next.resultVersions);
 expect((await env.call('POST',`/studio-api/prompt-drafts/${d.id}/compile`,{...env.headers(a),payload:{expectedRevision:0}})).statusCode).toBe(409);
});
it('rolls back content and history when saving a revision fails',async()=>{
 const a=await env.signup(),response=await create(a);expect(response.statusCode).toBe(201);const p=response.json();
 await env.pool.query(`CREATE FUNCTION reject_content_version() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fake history failure'; END $$`);await env.pool.query('CREATE TRIGGER reject_content_version BEFORE INSERT ON workspace_content_versions FOR EACH ROW EXECUTE FUNCTION reject_content_version()');
 expect((await env.call('PATCH',`/studio-api/prompts/${p.id}`,{...env.headers(a),payload:{expectedRevision:0,body:'不应提交'}})).statusCode).toBe(500);
 expect((await env.call('GET',`/studio-api/prompts/${p.id}`,env.headers(a))).json()).toEqual(p);
});
it('accepts owned prompt provenance in graph commands, refuses foreign provenance, and preserves drafts/library versions through a project package',async()=>{
 const a=await env.signup('ContentOwner'),b=await env.signup('ContentOther');const p=(await env.call('POST','/studio-api/projects',{...env.headers(a),payload:{title:'提示词来源项目'}})).json();
 const entry=await create(a);expect(entry.statusCode).toBe(201);const library=entry.json(),d=await draft(a,{sourceProjectId:p.id});
 const compiled=await env.call('POST',`/studio-api/prompt-drafts/${d.id}/compile`,{...env.headers(a),payload:{expectedRevision:0}});expect(compiled.statusCode).toBe(200);const version=compiled.json().resultVersions[0];
 const node={id:randomUUID(),type:'text',title:'提示词结果',x:0,y:0,locked:false,data:{kind:'text',text:version.finalPrompt,referenceTokens:[],promptLibrarySource:{entryId:library.id,revision:0,source:library.source,license:library.license},promptGenerationSource:{draftId:d.id,resultVersionId:version.id,sourceRevision:0,origin:'local',ruleVersion:d.ruleVersion}}};
 const payload={expectedRevision:0,idempotencyKey:randomUUID(),command:{type:'operations',operations:[{id:randomUUID(),type:'add_node',payload:{node}}]}};
 const saved=await env.call('POST',`/studio-api/projects/${p.id}/commands`,{...env.headers(a),payload});expect(saved.statusCode).toBe(200);
 const pb=(await env.call('POST','/studio-api/projects',{...env.headers(b),payload:{title:'B 的项目'}})).json();expect((await env.call('POST',`/studio-api/projects/${pb.id}/commands`,{...env.headers(b),payload:{...payload,idempotencyKey:randomUUID()}})).statusCode).toBe(404);
 const exported=await env.call('GET',`/studio-api/projects/${p.id}/export`,env.headers(a));expect(exported.statusCode).toBe(200);expect(exported.json().content).toHaveLength(2);
 const imported=await env.call('POST','/studio-api/projects/import',{...env.headers(b),payload:{data:exported.json(),assets:{},idempotencyKey:randomUUID()}});expect(imported.statusCode).toBe(201);const next=imported.json(),provenance=next.graph.nodes[0].data;
 expect(provenance.promptGenerationSource.draftId).not.toBe(d.id);expect(provenance.promptGenerationSource.resultVersionId).not.toBe(version.id);expect(provenance.promptLibrarySource.entryId).not.toBe(library.id);
 const importedDraft=await env.call('GET',`/studio-api/prompt-drafts/${provenance.promptGenerationSource.draftId}`,env.headers(b));expect(importedDraft.statusCode).toBe(200);expect(importedDraft.json().sourceProjectId).toBe(next.project.id);expect(importedDraft.json().resultVersions[0].id).toBe(provenance.promptGenerationSource.resultVersionId);
 expect((await env.call('GET',`/studio-api/prompt-drafts/${provenance.promptGenerationSource.draftId}/revisions/0`,env.headers(b))).json().resultVersions).toEqual([]);
});
it('appends manual result changes and restores a historical result without deleting inputs or earlier results',async()=>{
 const a=await env.signup(),d=await draft(a);
 const result={finalPrompt:'手写镜头正文',shotPlan:[],improvements:[],warnings:[],suggestedSpec:{}};
 const edited=await env.call('POST',`/studio-api/prompt-drafts/${d.id}/results`,{...env.headers(a),payload:{expectedRevision:0,result}});expect(edited.statusCode).toBe(200);const version=edited.json().resultVersions[0];expect(version).toMatchObject({origin:'manual',sourceRevision:0,finalPrompt:result.finalPrompt});
 const modified=await env.call('PATCH',`/studio-api/prompt-drafts/${d.id}`,{...env.headers(a),payload:{expectedRevision:1,userRequest:'新的输入'}});expect(modified.statusCode).toBe(200);
 const restored=await env.call('POST',`/studio-api/prompt-drafts/${d.id}/results/${version.id}/restore`,{...env.headers(a),payload:{expectedRevision:2}});expect(restored.statusCode).toBe(200);expect(restored.json()).toMatchObject({userRequest:'新的输入',revision:3,resultVersions:[version,{origin:'manual',sourceRevision:2,restoredFromVersionId:version.id,finalPrompt:result.finalPrompt}]});
 expect((await env.call('POST',`/studio-api/prompt-drafts/${d.id}/results`,{...env.headers(a),payload:{expectedRevision:3,result:{...result,apiKey:'FAKE_NOT_ALLOWED'}}})).statusCode).toBe(400);
});
