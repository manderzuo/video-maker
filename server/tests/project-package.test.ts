import {randomUUID,createHash} from 'node:crypto';
import {mkdtemp,rm,unlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,beforeEach,it,expect} from 'vitest';
import {fixture,origin,type Fixture,type Account} from './account-fixture.js';
let env:Fixture,root:string;
const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6nRAAAAAASUVORK5CYII=','base64'),hash=createHash('sha256').update(bytes).digest('hex');
beforeEach(async()=>{root=await mkdtemp(join(tmpdir(),'aiwork-package-test-'));env=await fixture({workspace:true,assets:{root,maxAssetBytes:1024,userQuotaBytes:4096,maxThumbnailBytes:512}});});
afterEach(async()=>{await env?.close();if(root.startsWith(join(tmpdir(),'aiwork-package-test-')))await rm(root,{recursive:true,force:true});});
async function asset(a:Account){
 const input={title:'包内素材',mimeType:'image/png',bytes:bytes.length,sha256:hash,thumbnail:{mimeType:'image/png',bytes:bytes.length,sha256:hash}};
 const reserved=(await env.call('POST','/studio-api/assets',{...env.headers(a),payload:input})).json();if(!reserved.state)return reserved;
 for(const variant of ['original','thumbnail']){const h=env.headers(a),r=await env.app.inject({method:'PUT',url:`/studio-api/assets/${reserved.id}/content?variant=${variant}`,payload:bytes,headers:{cookie:h.cookie,'x-workspace-context':h.context,'x-csrf-token':h.csrf,origin,'content-type':'application/octet-stream'}});expect(r.statusCode).toBe(204);}
 return (await env.call('POST',`/studio-api/assets/${reserved.id}/complete`,{...env.headers(a),payload:{}})).json();
}
async function project(a:Account){
 const media=await asset(a),p=(await env.call('POST','/studio-api/projects',{...env.headers(a),payload:{title:'带历史的项目'}})).json();
 const node={id:randomUUID(),type:'asset',title:'图片',x:40,y:20,locked:false,data:{kind:'asset',assetId:media.id}};
 for(const command of [{type:'operations',operations:[{id:randomUUID(),type:'add_node',payload:{node}}]},{type:'undo'}]){const r=await env.call('POST',`/studio-api/projects/${p.id}/commands`,{...env.headers(a),payload:{expectedRevision:p.revision++,idempotencyKey:randomUUID(),command}});expect(r.statusCode).toBe(200);}
 return {p,media};
}
const exporting=(a:Account,id:string)=>env.call('GET',`/studio-api/projects/${id}/export`,env.headers(a));
const importing=(a:Account,data:unknown,mapping:Record<string,string>,key=randomUUID())=>env.call('POST','/studio-api/projects/import',{...env.headers(a),payload:{data,assets:mapping,idempotencyKey:key}});
it('exports owned current graph, undo/redo snapshots and original/thumbnail manifests without secrets or paths',async()=>{
 const a=await env.signup(),{p,media}=await project(a),r=await exporting(a,p.id);expect(r.statusCode).toBe(200);
 expect(r.json()).toMatchObject({format:'aiwork-studio-cloud-project',version:1,project:{id:p.id,revision:2},graph:{nodes:[]},assets:[{asset:{id:media.id},thumbnail:{sha256:hash}}],history:{undo:[],redo:[expect.any(String)]}});
 expect(r.json().history.receipts).toHaveLength(2);expect(r.payload).not.toMatch(/user_id|fingerprint|idempotencyKey|apiKey|token_digest|C:\\|\.pem/);
});
it('imports into a new account with remapped identities and usable persisted redo, and retries without duplication',async()=>{
 const a=await env.signup('Package_A'),b=await env.signup('Package_B'),{p,media}=await project(a),data=(await exporting(a,p.id)).json(),owned=await asset(b),key=randomUUID();
 const response=await importing(b,data,{[media.id]:owned.id},key);expect(response.statusCode).toBe(201);const next=response.json();expect(next.project.id).not.toBe(p.id);expect(next.graph).toMatchObject({projectId:next.project.id,revision:0,nodes:[]});
 expect((await importing(b,data,{[media.id]:owned.id},key)).json().project.id).toBe(next.project.id);
 const redone=await env.call('POST',`/studio-api/projects/${next.project.id}/commands`,{...env.headers(b),payload:{expectedRevision:0,idempotencyKey:randomUUID(),command:{type:'redo'}}});expect(redone.statusCode).toBe(200);expect(redone.json().graph.nodes[0].data.assetId).toBe(owned.id);
 expect((await env.pool.query('SELECT id FROM workspace_projects WHERE user_id=$1',[b.view.user.id])).rows).toHaveLength(1);
});
it('rejects foreign export, foreign upload mappings and altered file manifests without committing a project',async()=>{
 const a=await env.signup('Foreign_A'),b=await env.signup('Foreign_B'),{p,media}=await project(a);
 expect((await exporting(b,p.id)).statusCode).toBe(404);const data=(await exporting(a,p.id)).json();expect((await importing(b,data,{[media.id]:media.id})).statusCode).toBe(404);
 const owned=await asset(b),bad=structuredClone(data);bad.assets[0].asset.sha256='0'.repeat(64);expect((await importing(b,bad,{[media.id]:owned.id})).statusCode).toBe(400);
 expect((await env.pool.query('SELECT id FROM workspace_projects WHERE user_id=$1',[b.view.user.id])).rows).toHaveLength(0);
});
it('rolls back a project import when recording the durable import receipt fails',async()=>{
 const a=await env.signup(),{p,media}=await project(a),data=(await exporting(a,p.id)).json();
 await env.pool.query(`CREATE FUNCTION reject_import() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fake import failure'; END $$`);
 await env.pool.query('CREATE TRIGGER reject_import BEFORE INSERT ON workspace_project_imports FOR EACH ROW EXECUTE FUNCTION reject_import()');
 expect((await importing(a,data,{[media.id]:media.id})).statusCode).toBe(500);expect((await env.pool.query('SELECT id FROM workspace_projects')).rows).toHaveLength(1);
});
it('refuses incomplete server files during export and import even when metadata says complete',async()=>{
 const a=await env.signup(),{p,media}=await project(a),response=await exporting(a,p.id);expect(response.statusCode).toBe(200);
 await unlink(join(root,a.view.user.id,media.id,'thumbnail-'+hash));
 expect((await exporting(a,p.id)).statusCode).toBe(409);expect((await importing(a,response.json(),{[media.id]:media.id})).statusCode).toBe(409);
 expect((await env.pool.query('SELECT id FROM workspace_projects')).rows).toHaveLength(1);
});
