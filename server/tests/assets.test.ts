import {randomUUID,createHash} from 'node:crypto';
import {mkdtemp,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,beforeEach,expect,it} from 'vitest';
import {fixture,origin,type Fixture,type Account} from './account-fixture.js';
let env:Fixture,root:string;
const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6nRAAAAAASUVORK5CYII=','base64');
const sha=(value:Buffer)=>createHash('sha256').update(value).digest('hex');
beforeEach(async()=>{root=await mkdtemp(join(tmpdir(),'aiwork-assets-test-'));env=await fixture({workspace:true,assets:{root,maxAssetBytes:1024,userQuotaBytes:4096,maxThumbnailBytes:512}});});
afterEach(async()=>{await env?.close();if(root.startsWith(join(tmpdir(),'aiwork-assets-test-')))await rm(root,{recursive:true,force:true});});
async function begin(account:Account,patch:Record<string,unknown>={}){const response=await env.call('POST','/studio-api/assets',{...env.headers(account),payload:{title:'测试图片',mimeType:'image/png',bytes:bytes.length,sha256:sha(bytes),...patch}});expect(response.statusCode).toBe(201);return response.json<{id:string;state:string}>();}
async function upload(account:Account,id:string,body=bytes,variant='original'){
 const h=env.headers(account);return env.app.inject({method:'PUT',url:`/studio-api/assets/${id}/content?variant=${variant}`,payload:body,headers:{cookie:h.cookie,'x-workspace-context':h.context,'x-csrf-token':h.csrf,origin,'content-type':'application/octet-stream'}});
}
const complete=(a:Account,id:string)=>env.call('POST',`/studio-api/assets/${id}/complete`,{...env.headers(a),payload:{}});
it('publishes original and thumbnail only after complete size/hash validation',async()=>{
 const a=await env.signup(),asset=await begin(a,{thumbnail:{bytes:bytes.length,sha256:sha(bytes),mimeType:'image/png'}});
 expect((await env.call('GET','/studio-api/assets',env.headers(a))).json()).toEqual([]);
 expect((await env.call('GET',`/studio-api/assets/${asset.id}/content`,env.headers(a))).statusCode).toBe(404);
 expect((await upload(a,asset.id)).statusCode).toBe(204);expect((await complete(a,asset.id)).statusCode).toBe(409);
 expect((await upload(a,asset.id,bytes,'thumbnail')).statusCode).toBe(204);
 const saved=await complete(a,asset.id);expect(saved.statusCode).toBe(200);expect(saved.json()).toMatchObject({id:asset.id,bytes:bytes.length,sha256:sha(bytes),mediaType:'image',metadataRevision:0});
 expect(saved.json()).not.toHaveProperty('path');expect(saved.json()).not.toHaveProperty('userId');
 for(const variant of ['original','thumbnail']){const r=await env.call('GET',`/studio-api/assets/${asset.id}/content?variant=${variant}`,env.headers(a));expect(r.statusCode).toBe(200);expect(r.rawPayload).toEqual(bytes);expect(r.headers['x-content-type-options']).toBe('nosniff');}
});
it('authenticates GET/HEAD/Range by concrete owner even for media elements without a workspace header',async()=>{
 const a=await env.signup('Media_A'),b=await env.signup('Media_B'),asset=await begin(a);await upload(a,asset.id);await complete(a,asset.id);
 for(const method of ['GET','HEAD'] as const){
  expect((await env.call(method,`/studio-api/assets/${asset.id}/content`)).statusCode).toBe(401);
  expect((await env.call(method,`/studio-api/assets/${asset.id}/content`,{cookie:b.cookie,extraHeaders:{range:'bytes=0-9'}})).statusCode).toBe(404);
  const own=await env.call(method,`/studio-api/assets/${asset.id}/content`,{cookie:a.cookie,extraHeaders:{range:'bytes=0-9'}});expect(own.statusCode).toBe(206);expect(own.headers['content-range']).toBe(`bytes 0-9/${bytes.length}`);expect(own.headers['content-length']).toBe('10');if(method==='GET')expect(own.rawPayload).toEqual(bytes.subarray(0,10));else expect(own.rawPayload.length).toBe(0);
 }
 expect((await env.call('GET',`/studio-api/assets/${asset.id}/content`,{...env.headers(a),extraHeaders:{range:'bytes=-4'}})).rawPayload).toEqual(bytes.subarray(-4));
 expect((await env.call('GET',`/studio-api/assets/${asset.id}/content`,{...env.headers(a),extraHeaders:{range:'bytes=999-1000'}})).statusCode).toBe(416);
});
it('rejects wrong hashes and interrupted sizes and leaves no complete asset or partial file',async()=>{
 const a=await env.signup(),asset=await begin(a);
 expect((await upload(a,asset.id,bytes.subarray(0,20))).statusCode).toBe(400);
 expect((await upload(a,asset.id,Buffer.alloc(bytes.length))).statusCode).toBe(400);
 expect((await complete(a,asset.id)).statusCode).toBe(409);expect((await env.call('GET','/studio-api/assets',env.headers(a))).json()).toEqual([]);
 const files=await readdir(join(root,a.view.user.id,asset.id));expect(files).toEqual([]);
 expect((await upload(a,asset.id)).statusCode).toBe(204);expect((await complete(a,asset.id)).statusCode).toBe(200);
});
it('does not falsely publish when database completion fails and allows a safe retry',async()=>{
 const a=await env.signup(),asset=await begin(a);await upload(a,asset.id);
 await env.pool.query(`CREATE FUNCTION reject_asset_complete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.state='complete' THEN RAISE EXCEPTION 'fake DB failure'; END IF; RETURN NEW; END $$`);
 await env.pool.query('CREATE TRIGGER reject_asset_complete BEFORE UPDATE ON workspace_assets FOR EACH ROW EXECUTE FUNCTION reject_asset_complete()');
 expect((await complete(a,asset.id)).statusCode).toBe(500);expect((await env.call('GET','/studio-api/assets',env.headers(a))).json()).toEqual([]);
 expect((await env.call('GET',`/studio-api/assets/${asset.id}/content`,env.headers(a))).statusCode).toBe(404);
 await env.pool.query('DROP TRIGGER reject_asset_complete ON workspace_assets');expect((await complete(a,asset.id)).statusCode).toBe(200);
});
it('partitions hash deduplication by owner and refuses overwrite after publication',async()=>{
 const a=await env.signup('Hash_A'),b=await env.signup('Hash_B'),asset=await begin(a);await upload(a,asset.id);await complete(a,asset.id);
 const duplicate=await env.call('POST','/studio-api/assets',{...env.headers(a),payload:{title:'重复',mimeType:'image/png',bytes:bytes.length,sha256:sha(bytes)}});expect(duplicate.statusCode).toBe(200);expect(duplicate.json().id).toBe(asset.id);
 const other=await begin(b);expect(other.id).not.toBe(asset.id);expect((await upload(b,asset.id)).statusCode).toBe(404);expect((await complete(b,asset.id)).statusCode).toBe(404);
 expect((await upload(a,asset.id)).statusCode).toBe(409);
});
it('enforces declared quota before reserving storage and excludes client filenames and paths',async()=>{
 const a=await env.signup();
 for(const patch of [{bytes:1025},{title:'../file',path:'../file'},{userId:a.view.user.id},{mimeType:'text/html'},{thumbnail:{bytes:513,sha256:sha(bytes),mimeType:'image/png'}}])expect((await env.call('POST','/studio-api/assets',{...env.headers(a),payload:{title:'图片',mimeType:'image/png',bytes:bytes.length,sha256:sha(bytes),...patch}})).statusCode).toBe(400);
 for(let n=0;n<4;n++)await begin(a,{bytes:1024,sha256:sha(Buffer.from(String(n)))});
 const full=await env.call('POST','/studio-api/assets',{...env.headers(a),payload:{title:'超额',mimeType:'image/png',bytes:1,sha256:sha(Buffer.from('quota'))}});expect(full.statusCode).toBe(413);expect(full.json()).toEqual({code:'USER_QUOTA_EXCEEDED'});
});
it('accepts only owned complete assets in graph nodes and preserves asset references across undo',async()=>{
 const a=await env.signup('Ref_A'),b=await env.signup('Ref_B'),asset=await begin(a);await upload(a,asset.id);await complete(a,asset.id);
 const p=(await env.call('POST','/studio-api/projects',{...env.headers(a),payload:{title:'素材引用'}})).json<{id:string}>();
 const make=(assetId:string)=>({expectedRevision:0,idempotencyKey:randomUUID(),command:{type:'operations',operations:[{id:randomUUID(),type:'add_node',payload:{node:{id:randomUUID(),type:'asset',title:'图片',x:0,y:0,locked:false,data:{kind:'asset',assetId}}}}]}});
 const other=await begin(b);await upload(b,other.id);await complete(b,other.id);
 expect((await env.call('POST',`/studio-api/projects/${p.id}/commands`,{...env.headers(a),payload:make(other.id)})).statusCode).toBe(404);
 const saved=await env.call('POST',`/studio-api/projects/${p.id}/commands`,{...env.headers(a),payload:make(asset.id)});expect(saved.statusCode).toBe(200);
 expect((await env.call('DELETE',`/studio-api/assets/${asset.id}`,{...env.headers(a),payload:{expectedRevision:0}})).statusCode).toBe(409);
 await env.call('POST',`/studio-api/projects/${p.id}/commands`,{...env.headers(a),payload:{expectedRevision:1,idempotencyKey:randomUUID(),command:{type:'undo'}}});
 expect((await env.call('DELETE',`/studio-api/assets/${asset.id}`,{...env.headers(a),payload:{expectedRevision:0}})).statusCode).toBe(409);
});
it('changes owned metadata with revision protection and restores trash without losing original',async()=>{
 const a=await env.signup('Trash_A'),b=await env.signup('Trash_B'),asset=await begin(a);await upload(a,asset.id);await complete(a,asset.id);
 expect((await env.call('PATCH',`/studio-api/assets/${asset.id}`,{...env.headers(b),payload:{expectedRevision:0,title:'不是我的'}})).statusCode).toBe(404);
 const changed=await env.call('PATCH',`/studio-api/assets/${asset.id}`,{...env.headers(a),payload:{expectedRevision:0,title:'新名称',description:'说明',tags:['标签']}});expect(changed.statusCode).toBe(200);expect(changed.json().metadataRevision).toBe(1);
 expect((await env.call('DELETE',`/studio-api/assets/${asset.id}`,{...env.headers(a),payload:{expectedRevision:0}})).statusCode).toBe(409);
 expect((await env.call('DELETE',`/studio-api/assets/${asset.id}`,{...env.headers(a),payload:{expectedRevision:1}})).statusCode).toBe(200);
 expect((await env.call('GET',`/studio-api/assets/${asset.id}/content`,env.headers(a))).statusCode).toBe(404);
 const restored=await env.call('POST',`/studio-api/assets/${asset.id}/restore`,{...env.headers(a),payload:{expectedRevision:2}});expect(restored.statusCode).toBe(200);
 expect((await env.call('GET',`/studio-api/assets/${asset.id}/content`,env.headers(a))).rawPayload).toEqual(bytes);
});
it('deduplicates two completed uploads of the same owned hash without reporting a database failure',async()=>{
 const a=await env.signup(),first=await begin(a),second=await begin(a);await upload(a,first.id);await upload(a,second.id);
 const saved=await Promise.all([complete(a,first.id),complete(a,second.id)]);expect(saved.map(r=>r.statusCode)).toEqual([200,200]);expect(saved[0].json().id).toBe(saved[1].json().id);expect((await env.call('GET','/studio-api/assets',env.headers(a))).json()).toHaveLength(1);
});
it('cancels only owned pending uploads, releasing quota and removing temporary original files',async()=>{
 const a=await env.signup('Cancel_A'),b=await env.signup('Cancel_B'),asset=await begin(a);await upload(a,asset.id);
 const cancel=(account:Account)=>env.call('DELETE',`/studio-api/assets/${asset.id}/upload`,{...env.headers(account),payload:{}});
 expect((await cancel(b)).statusCode).toBe(404);expect((await cancel(a)).statusCode).toBe(204);expect((await complete(a,asset.id)).statusCode).toBe(404);
 expect((await env.pool.query('SELECT COUNT(*)::integer AS count FROM workspace_assets WHERE user_id=$1',[a.view.user.id])).rows[0].count).toBe(0);
 expect(await readdir(join(root,a.view.user.id))).toEqual([]);
});
