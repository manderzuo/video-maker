import {expect,it,vi} from 'vitest';
import {createApiSettingsClient,ApiSettingsError,type ApiSettingsIdentity,type ModelConfig,type ModelProbe} from '../../src/features/settings/api-settings-client';
import {createApiSettingsStore,type ApiSettingsBridge} from '../../src/features/settings/use-api-settings';
const a:ApiSettingsIdentity={userId:'11111111-1111-4111-8111-111111111111',contextId:'a'.repeat(43),csrfToken:'c'.repeat(43)};
const b:ApiSettingsIdentity={...a,userId:'22222222-2222-4222-8222-222222222222',contextId:'b'.repeat(43)};
const saved:ModelConfig={channel:'text',apiBase:'https://fake.example/api',model:'Vendor/Old',revision:2,hasKey:true};
const reply=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status});
const probe=(requestId:string):ModelProbe=>({requestId,connection:'verified',catalogStatus:'ready',models:['Vendor/Listed'],message:'Catalog read',complete:true});
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return {promise,resolve};}
function fixture(configs:ModelConfig[]=[],opts:{autoProbe?:boolean}={}){
 let identity:ApiSettingsIdentity|null=a;const listeners=new Set<()=>void>();
 const bridge:ApiSettingsBridge={getIdentity:()=>identity,subscribe:listener=>{listeners.add(listener);return()=>{listeners.delete(listener);};},refresh:vi.fn(async()=>{})};
 const fetcher=vi.fn<typeof fetch>(async(path,init)=>{
  if(init?.method==='PATCH'){const input=JSON.parse(init.body as string);return reply({...saved,apiBase:input.apiBase,model:input.model,revision:(input.expectedRevision??0)+1});}
  if(init?.method==='POST')return reply(probe(JSON.parse(init.body as string).requestId));
  return reply({configs});
 });
 const store=createApiSettingsStore(bridge,createApiSettingsClient(fetcher),{autoProbe:opts.autoProbe??false});
 return {store,fetcher,change(next:ApiSettingsIdentity|null){identity=next;for(const listener of listeners)listener();}};
}
it('API settings use fixed same-origin paths and captured context/CSRF without an owner field',async()=>{
 const fetcher=vi.fn<typeof fetch>().mockResolvedValue(reply(saved));
 await createApiSettingsClient(fetcher).save('text',{apiBase:saved.apiBase,model:'Vendor/Manual',expectedRevision:2},a);
 const [path,init]=fetcher.mock.calls[0];expect(path).toBe('/studio-api/me/model-configs/text');expect(init).toMatchObject({method:'PATCH',credentials:'same-origin',mode:'same-origin',cache:'no-store',redirect:'error',headers:{'X-Workspace-Context':a.contextId,'X-CSRF-Token':a.csrfToken}});expect(JSON.parse(init?.body as string)).not.toHaveProperty('userId');
});
it('API settings reject unexpected secret-bearing DTOs and reflected error text',async()=>{
 const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(reply({configs:[{...saved,apiKey:'FAKE_LEAK'}]})).mockResolvedValueOnce(reply({code:'FAKE_SECRET',message:'FAKE_LEAK'},500));
 const client=createApiSettingsClient(fetcher);await expect(client.list(a)).rejects.toMatchObject({code:'INVALID_RESPONSE'});await expect(client.list(a)).rejects.toMatchObject({code:'INTERNAL_ERROR'});
});
it('API config responses must match the channel requested and list channels cannot repeat',async()=>{
 const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(reply({...saved,channel:'video'})).mockResolvedValueOnce(reply({configs:[saved,saved]}));const client=createApiSettingsClient(fetcher);
 await expect(client.save('text',{apiBase:saved.apiBase,model:saved.model,expectedRevision:2},a)).rejects.toMatchObject({code:'INVALID_RESPONSE'});await expect(client.list(a)).rejects.toMatchObject({code:'INVALID_RESPONSE'});
});
it('a text probe works without a model and does not save or submit a generation request',async()=>{
 const f=fixture();f.store.start();await vi.waitFor(()=>expect(f.store.getState().status).toBe('ready'));f.store.edit('text','apiBase','https://fake.example/api');f.store.edit('text','apiKey','FAKE_KEY_TEXT');await f.store.test('text');
 const writes=f.fetcher.mock.calls.filter(([,init])=>init?.method==='POST');expect(writes).toHaveLength(1);expect(writes[0][0]).toBe('/studio-api/me/model-configs/text/test');expect(JSON.parse(writes[0][1]?.body as string)).not.toHaveProperty('model');expect(f.store.getState().text.model).toBe('');expect(f.store.getState().text.result?.models).toEqual(['Vendor/Listed']);expect(f.store.getState().text.saved).toBeNull();f.store.dispose();
});
it('manual model outside catalog can be saved without testing and newly saved key leaves only a placeholder',async()=>{
 const f=fixture();f.store.start();await vi.waitFor(()=>expect(f.store.getState().status).toBe('ready'));f.store.edit('text','apiBase','https://fake.example/api');f.store.edit('text','model','  Vendor/Unlisted  ');f.store.edit('text','apiKey','FAKE_KEY_TEXT');await f.store.save('text');
 expect(f.fetcher.mock.calls.filter(([,init])=>init?.method==='POST')).toEqual([]);const write=f.fetcher.mock.calls.find(([,init])=>init?.method==='PATCH');expect(JSON.parse(write?.[1]?.body as string)).toEqual({apiBase:'https://fake.example/api',model:'Vendor/Unlisted',apiKey:'FAKE_KEY_TEXT',expectedRevision:null});expect(f.store.getState().text.apiKey).toBe('');expect(f.store.getState().text.saved?.hasKey).toBe(true);f.store.dispose();
});
it('saved key is omitted only at the same normalized address and masks never reach the transport',async()=>{
 const f=fixture([saved]);f.store.start();await vi.waitFor(()=>expect(f.store.getState().status).toBe('ready'));expect(f.store.getState().text.apiKey).toBe('');f.store.edit('text','apiBase',saved.apiBase+'/v1/');await f.store.save('text');const first=f.fetcher.mock.calls.find(([,init])=>init?.method==='PATCH');expect(JSON.parse(first?.[1]?.body as string)).not.toHaveProperty('apiKey');
 f.store.edit('text','apiBase','https://other.fake.example');await f.store.save('text');expect(f.store.getState().text.error).toContain('密钥');const calls=f.fetcher.mock.calls.length;f.store.edit('text','apiKey','••••••');await f.store.test('text');expect(f.fetcher).toHaveBeenCalledTimes(calls);expect(f.store.getState().text.error).toContain('密钥');f.store.dispose();
});
it('retesting retains a manual model and changing connection fields clears stale catalog',async()=>{
 const f=fixture([saved]);f.store.start();await vi.waitFor(()=>expect(f.store.getState().status).toBe('ready'));f.store.edit('text','model','Vendor/Unlisted');await f.store.test('text');await f.store.test('text');expect(f.store.getState().text.model).toBe('Vendor/Unlisted');f.store.edit('text','apiKey','FAKE_CHANGED_KEY');expect(f.store.getState().text.result).toBeNull();f.store.dispose();
});
it('late test response cannot replace the catalog after the draft changes even if abort is ignored',async()=>{
 const f=fixture([saved]);f.store.start();await vi.waitFor(()=>expect(f.store.getState().status).toBe('ready'));const late=deferred<Response>();f.fetcher.mockImplementationOnce(()=>late.promise);const pending=f.store.test('text');await vi.waitFor(()=>expect(f.store.getState().text.pending).toBe('test'));const requestId=JSON.parse(f.fetcher.mock.calls.at(-1)?.[1]?.body as string).requestId;f.store.edit('text','apiBase','https://other.fake.example');late.resolve(reply(probe(requestId)));await pending;expect(f.store.getState().text.result).toBeNull();expect(f.store.getState().text.apiBase).toBe('https://other.fake.example');f.store.dispose();
});
it('late A saved configuration is discarded on a switch to B and all A drafts/keys are cleared',async()=>{
 const f=fixture([saved]);f.store.start();await vi.waitFor(()=>expect(f.store.getState().status).toBe('ready'));f.store.edit('text','model','A/Private');f.store.edit('text','apiKey','FAKE_A_PRIVATE_KEY');const late=deferred<Response>();f.fetcher.mockImplementationOnce(()=>late.promise);const pending=f.store.save('text');f.change(b);await vi.waitFor(()=>expect(f.store.getState().status).toBe('ready'));late.resolve(reply({...saved,model:'A/Private',revision:3}));await pending;expect(f.store.getState().text.model).toBe(saved.model);expect(f.store.getState().text.apiKey).toBe('');expect(f.store.getState().text.error).toBe('');expect(f.fetcher.mock.calls.at(-1)?.[1]?.headers).toMatchObject({'X-Workspace-Context':b.contextId});f.store.dispose();
});
it('failed save and revision conflict preserve inputs until explicit reload',async()=>{
 const f=fixture([saved]);f.store.start();await vi.waitFor(()=>expect(f.store.getState().status).toBe('ready'));f.store.edit('text','model','Vendor/Changed');f.store.edit('text','apiKey','FAKE_UNSAVED');f.fetcher.mockResolvedValueOnce(reply({code:'REVISION_CONFLICT'},409));await f.store.save('text');expect(f.store.getState().text.model).toBe('Vendor/Changed');expect(f.store.getState().text.apiKey).toBe('FAKE_UNSAVED');expect(f.store.getState().text.conflict).toBe(true);await f.store.reload();expect(f.store.getState().text.model).toBe(saved.model);expect(f.store.getState().text.apiKey).toBe('');f.store.dispose();
});
it('save accepted while user keeps editing updates saved revision but does not overwrite newer draft',async()=>{
 const f=fixture([saved]);f.store.start();await vi.waitFor(()=>expect(f.store.getState().status).toBe('ready'));f.store.edit('text','model','Vendor/Sent');const late=deferred<Response>();f.fetcher.mockImplementationOnce(()=>late.promise);const pending=f.store.save('text');f.store.edit('text','model','Vendor/NewDraft');late.resolve(reply({...saved,model:'Vendor/Sent',revision:3}));await pending;expect(f.store.getState().text.model).toBe('Vendor/NewDraft');expect(f.store.getState().text.saved?.revision).toBe(3);f.store.dispose();
});
it('same context notifications retain drafts, while invalidation/disposal clears key material',async()=>{
 const f=fixture([saved]);f.store.start();await vi.waitFor(()=>expect(f.store.getState().status).toBe('ready'));f.store.edit('text','apiKey','FAKE_PRIVATE');const calls=f.fetcher.mock.calls.length;f.change({...a});expect(f.store.getState().text.apiKey).toBe('FAKE_PRIVATE');expect(f.fetcher).toHaveBeenCalledTimes(calls);f.change(null);expect(f.store.getState().status).toBe('inactive');expect(f.store.getState().text.apiKey).toBe('');f.store.dispose();expect(f.store.getState().text.saved).toBeNull();
});
it('a SESSION_CHANGED response invalidates visible drafts and asks the session boundary to recheck',async()=>{
 const f=fixture([saved]);f.store.start();await vi.waitFor(()=>expect(f.store.getState().status).toBe('ready'));f.store.edit('text','apiKey','FAKE_KEY');f.fetcher.mockResolvedValueOnce(reply({code:'SESSION_CHANGED'},409));await f.store.test('text');expect(f.store.getState().status).toBe('inactive');expect(f.store.getState().text.apiKey).toBe('');f.store.dispose();
});
it('model catalog unavailable still allows manual model save without claiming generation success',async()=>{
 const f=fixture([saved]);f.store.start();await vi.waitFor(()=>expect(f.store.getState().status).toBe('ready'));f.fetcher.mockImplementationOnce(async(_path,init)=>reply({...probe(JSON.parse(init?.body as string).requestId),connection:'unknown',catalogStatus:'unavailable',models:[]}));await f.store.test('text');expect(f.store.getState().text.result?.catalogStatus).toBe('unavailable');f.store.edit('text','model','Vendor/Manual');await f.store.save('text');expect(f.store.getState().text.saved?.model).toBe('Vendor/Manual');f.store.dispose();
});
it('wrong probe request ID cannot be shown in the current draft',async()=>{
 const f=fixture([saved]);f.store.start();await vi.waitFor(()=>expect(f.store.getState().status).toBe('ready'));f.fetcher.mockResolvedValueOnce(reply(probe('another-request')));await f.store.test('text');expect(f.store.getState().text.result).toBeNull();expect(f.store.getState().text.error).not.toBe('');f.store.dispose();
});
it('a transport error becomes a safe application error without raw key or server response',async()=>{
 const client=createApiSettingsClient(async()=>{throw new Error('FAKE_KEY_UPSTREAM');});await expect(client.list(a)).rejects.toBeInstanceOf(ApiSettingsError);
});
it('an old aborted probe finishing cannot clear the pending state of a newer probe',async()=>{
 const f=fixture([saved]);f.store.start();await vi.waitFor(()=>expect(f.store.getState().status).toBe('ready'));const first=deferred<Response>(),second=deferred<Response>();f.fetcher.mockImplementationOnce(()=>first.promise).mockImplementationOnce(()=>second.promise);
 const old=f.store.test('text');const oldId=JSON.parse(f.fetcher.mock.calls.at(-1)?.[1]?.body as string).requestId;f.store.edit('text','model','Vendor/NewDraft');const fresh=f.store.test('text');const freshId=JSON.parse(f.fetcher.mock.calls.at(-1)?.[1]?.body as string).requestId;
 first.resolve(reply(probe(oldId)));await old;expect(f.store.getState().text.pending).toBe('test');second.resolve(reply(probe(freshId)));await fresh;expect(f.store.getState().text.result?.requestId).toBe(freshId);expect(f.store.getState().text.pending).toBeNull();f.store.dispose();
});
it('failed explicit reload keeps unsaved input instead of destroying it',async()=>{
 const f=fixture([saved]);f.store.start();await vi.waitFor(()=>expect(f.store.getState().status).toBe('ready'));f.store.edit('text','model','Vendor/Unsaved');f.store.edit('text','apiKey','FAKE_KEEP_ON_RELOAD');f.fetcher.mockResolvedValueOnce(reply({code:'INTERNAL_ERROR'},500));await f.store.reload();expect(f.store.getState().text.model).toBe('Vendor/Unsaved');expect(f.store.getState().text.apiKey).toBe('FAKE_KEEP_ON_RELOAD');expect(f.store.getState().error).not.toBe('');f.store.dispose();
});
it('a verified probe records the tested address and time for the success display',async()=>{
 const f=fixture();f.store.start();await vi.waitFor(()=>expect(f.store.getState().status).toBe('ready'));f.store.edit('text','apiBase','https://fake.example/api');f.store.edit('text','apiKey','FAKE_KEY_TEXT');await f.store.test('text');
 const draft=f.store.getState().text;expect(draft.result).toMatchObject({connection:'verified',catalogStatus:'ready',models:['Vendor/Listed'],complete:true});expect(draft.testedBase).toBe('https://fake.example/api');expect(draft.testedAt).toEqual(expect.any(Number));f.store.dispose();
});
it('empty, failed, unknown and partial probe outcomes are kept with their catalog state',async()=>{
 const f=fixture();f.store.start();await vi.waitFor(()=>expect(f.store.getState().status).toBe('ready'));f.store.edit('text','apiBase','https://fake.example/api');f.store.edit('text','apiKey','FAKE_KEY_TEXT');
 for(const outcome of [{connection:'verified',catalogStatus:'empty',models:[],complete:true},{connection:'failed',catalogStatus:'failed',models:[],complete:true},{connection:'unknown',catalogStatus:'unavailable',models:[],complete:true},{connection:'verified',catalogStatus:'ready',models:['Vendor/A'],complete:false}] as const){
  f.fetcher.mockImplementationOnce(async(_path,init)=>reply({...probe(JSON.parse(init?.body as string).requestId),...outcome}));
  await f.store.test('text');expect(f.store.getState().text.result).toMatchObject(outcome);expect(f.store.getState().text.testedBase).toBe('https://fake.example/api');
 }
 f.store.dispose();
});
it('changing only the model keeps the catalog result while changing address or key clears it',async()=>{
 const f=fixture([saved]);f.store.start();await vi.waitFor(()=>expect(f.store.getState().status).toBe('ready'));await f.store.test('text');
 const testedAt=f.store.getState().text.testedAt;expect(f.store.getState().text.result?.models).toEqual(['Vendor/Listed']);
 f.store.edit('text','model','Vendor/HandKept');expect(f.store.getState().text.result?.models).toEqual(['Vendor/Listed']);expect(f.store.getState().text.testedAt).toBe(testedAt);
 f.store.edit('text','apiKey','FAKE_CHANGED_KEY');expect(f.store.getState().text.result).toBeNull();expect(f.store.getState().text.testedAt).toBeNull();f.store.dispose();
});
it('saving without a matching verified probe triggers one read-only probe without a generation call',async()=>{
 const f=fixture([],{autoProbe:true});f.store.start();await vi.waitFor(()=>expect(f.store.getState().status).toBe('ready'));
 f.store.edit('text','apiBase','https://fake.example/api');f.store.edit('text','model','Vendor/Unlisted');f.store.edit('text','apiKey','FAKE_KEY_TEXT');await f.store.save('text');
 await vi.waitFor(()=>expect(f.store.getState().text.pending).toBeNull());
 const posts=f.fetcher.mock.calls.filter(([,init])=>init?.method==='POST');
 expect(posts).toHaveLength(1);expect(posts[0][0]).toBe('/studio-api/me/model-configs/text/test');expect(JSON.parse(posts[0][1]?.body as string)).not.toHaveProperty('apiKey');
 expect(f.store.getState().text.result?.connection).toBe('verified');expect(f.store.getState().text.testedBase).toBe('https://fake.example/api');f.store.dispose();
});
it('re-entering settings probes saved keys once without sending key material in the draft',async()=>{
 const f=fixture([{...saved,apiBase:'https://fake.example/api'}],{autoProbe:true});f.store.start();
 await vi.waitFor(()=>expect(f.store.getState().text.result).not.toBeNull());
 const posts=f.fetcher.mock.calls.filter(([,init])=>init?.method==='POST');
 expect(posts).toHaveLength(1);expect(JSON.parse(posts[0][1]?.body as string)).not.toHaveProperty('apiKey');
 expect(f.store.getState().text.apiKey).toBe('');expect(f.store.getState().text.pending).toBeNull();f.store.dispose();
});
it('a matching verified probe suppresses the automatic probe after save',async()=>{
 const f=fixture([{...saved,apiBase:'https://fake.example/api'}],{autoProbe:true});f.store.start();
 await vi.waitFor(()=>expect(f.store.getState().text.result).not.toBeNull());
 f.fetcher.mockClear();f.store.edit('text','model','Vendor/Kept');await f.store.save('text');
 await vi.waitFor(()=>expect(f.store.getState().text.pending).toBeNull());
 expect(f.fetcher.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(0);f.store.dispose();
});
