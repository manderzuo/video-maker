import {it,expect,vi} from 'vitest';
import {createWorkspaceClient} from '../../src/infrastructure/api/workspace-client';
const identity={userId:'11111111-1111-4111-8111-111111111111',contextId:'a'.repeat(43),csrfToken:'c'.repeat(43)};
const project={id:'22222222-2222-4222-8222-222222222222',schemaVersion:1,title:'云端项目',description:'',revision:0,createdAt:1,updatedAt:1,archived:false,trashedAt:null,tags:[],starred:false};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
function bridge(){let current:typeof identity|null=identity;const listeners=new Set<()=>void>();return {getIdentity:()=>current,subscribe:(cb:()=>void)=>{listeners.add(cb);return()=>{listeners.delete(cb);};},change(){current={...identity,contextId:'b'.repeat(43)};for(const cb of listeners)cb();},refresh:vi.fn(async()=>{})};}
it('reads server projects without consulting legacy browser storage',async()=>{
 const fetcher=vi.fn<typeof fetch>().mockResolvedValue(json([project])),auth=bridge(),client=createWorkspaceClient(auth,fetcher);
 const old=vi.fn(()=>{throw new Error('legacy data must not be read');});vi.stubGlobal('indexedDB',{open:old});try{expect(await client.listProjects()).toEqual([project]);expect(old).not.toHaveBeenCalled();expect(fetcher.mock.calls[0]).toMatchObject(['/studio-api/projects',{credentials:'same-origin',cache:'no-store',redirect:'error',headers:{'X-Workspace-Context':identity.contextId}}]);}finally{client.dispose();vi.unstubAllGlobals();}
});
it('sends only a typed command with captured context, CSRF, revision and retry identity',async()=>{
 const auth=bridge(),fetcher=vi.fn<typeof fetch>().mockResolvedValue(json({id:project.id,status:'applied',revision:1,project:{...project,revision:1},graph:{projectId:project.id,revision:1,nodes:[],edges:[],viewport:{x:0,y:0,scale:1}}})),client=createWorkspaceClient(auth,fetcher);
 await client.command(project.id,0,{type:'undo'},project.id);const [,request]=fetcher.mock.calls[0];expect(request?.headers).toMatchObject({'X-Workspace-Context':identity.contextId,'X-CSRF-Token':identity.csrfToken});expect(JSON.parse(request!.body as string)).toEqual({expectedRevision:0,command:{type:'undo'},idempotencyKey:project.id});expect(request?.body).not.toContain('userId');client.dispose();
});
it('aborts a pending old-user request and rejects even a transport that ignores cancellation',async()=>{
 const auth=bridge();let release!:(value:Response)=>void;const fetcher=vi.fn<typeof fetch>(()=>new Promise(resolve=>{release=resolve;})),client=createWorkspaceClient(auth,fetcher);
 const pending=client.listProjects();const rejected=expect(pending).rejects.toMatchObject({code:'STALE_RESPONSE'});await vi.waitFor(()=>expect(fetcher).toHaveBeenCalledOnce());auth.change();expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);release(json([project]));await rejected;client.dispose();
});
it('preserves revision conflict and hides unrecognized server error text',async()=>{
 const auth=bridge(),fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(json({code:'REVISION_CONFLICT'},409)).mockResolvedValueOnce(json({code:'fake-secret',message:'fake-log'},500)),client=createWorkspaceClient(auth,fetcher);
 await expect(client.patchProject(project.id,0,{title:'未保存草稿'})).rejects.toMatchObject({status:409,code:'REVISION_CONFLICT'});await expect(client.listProjects()).rejects.toMatchObject({code:'INTERNAL_ERROR'});client.dispose();
});
it('rejects invalid resource paths and all operations after disposal without sending requests',async()=>{
 const auth=bridge(),fetcher=vi.fn<typeof fetch>(),client=createWorkspaceClient(auth,fetcher);await expect(client.readGraph('../session')).rejects.toMatchObject({code:'INVALID_REQUEST'});client.dispose();await expect(client.listProjects()).rejects.toMatchObject({code:'STALE_RESPONSE'});expect(fetcher).not.toHaveBeenCalled();
});
