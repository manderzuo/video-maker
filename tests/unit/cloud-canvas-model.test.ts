import {expect,it,vi} from 'vitest';
import {createCloudCanvasModel} from '../../src/features/workspace/cloud-canvas-model';
import type {WorkspaceClient} from '../../src/infrastructure/api/workspace-client';
const project={id:'11111111-1111-4111-8111-111111111111',schemaVersion:1 as const,title:'云端',description:'',tags:[],revision:0,createdAt:1,updatedAt:1,archived:false,trashedAt:null};
const graph={projectId:project.id,revision:0,nodes:[],edges:[],viewport:{x:0,y:0,scale:1}};
const snapshot={project,graph,history:{undoDepth:0,redoDepth:0}};
const node={id:'node',type:'text' as const,title:'文字',x:0,y:0,locked:false,data:{kind:'text' as const,text:'不丢失的输入',referenceTokens:[]}};
const operation={id:'op',type:'add_node' as const,payload:{node}};
function client(){return {readWorkspace:vi.fn(async()=>structuredClone(snapshot)),command:vi.fn<WorkspaceClient["command"]>(async()=>({id:'11111111-1111-4111-8111-111111111111',status:'applied' as const,revision:1,project:{...project,revision:1},graph:{...graph,revision:1,nodes:[node]},history:{undoDepth:1,redoDepth:0}}))};}
it('marks changes unsaved until the server receipt is accepted',async()=>{
 const api=client(),model=createCloudCanvasModel(project.id,api);await model.load();model.stage([operation]);expect(model.getState()).toMatchObject({status:'dirty',graph:{revision:0,nodes:[node]}});await model.save();expect(model.getState()).toMatchObject({status:'saved',graph:{revision:1,nodes:[node]}});expect(api.command).toHaveBeenCalledWith(project.id,0,{type:'operations',operations:[operation]},expect.any(String));model.dispose();
});
it('retains input on a revision conflict and requires explicit discard before reload',async()=>{
 const api=client();api.command.mockRejectedValueOnce(Object.assign(new Error('conflict'),{code:'REVISION_CONFLICT'}));const model=createCloudCanvasModel(project.id,api);await model.load();model.stage([operation]);await model.save();expect(model.getState()).toMatchObject({status:'failed',graph:{nodes:[node]},pending:[operation]});await expect(model.load()).rejects.toThrow('unsaved_changes');await model.load(true);expect(model.getState()).toMatchObject({status:'saved',pending:[],graph:{nodes:[]}});model.dispose();
});
it('retries a network-uncertain save with the same frozen request identity and content',async()=>{
 const api=client();api.command.mockRejectedValueOnce(new Error('network'));const model=createCloudCanvasModel(project.id,api);await model.load();model.stage([operation]);await model.save();await model.save();expect(api.command.mock.calls[1]).toEqual(api.command.mock.calls[0]);expect(model.getState().status).toBe('saved');model.dispose();
});
it('does not apply a late save receipt after the editor is disposed',async()=>{
 const api=client();let release!:(value:Awaited<ReturnType<typeof api.command>>)=>void;api.command.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));const model=createCloudCanvasModel(project.id,api);await model.load();model.stage([operation]);const saving=model.save();model.dispose();release({id:project.id,status:'applied',revision:1,project:{...project,revision:1},graph:{...graph,revision:1,nodes:[node]},history:{undoDepth:1,redoDepth:0}});await saving;expect(model.getState().graph?.revision).toBe(0);
});
it('retries an uncertain undo with the same command identity instead of undoing twice',async()=>{
 const api=client(),model=createCloudCanvasModel(project.id,api);await model.load();api.command.mockRejectedValueOnce(new Error('network'));await model.history('undo');await model.save();expect(api.command.mock.calls[1]).toEqual(api.command.mock.calls[0]);expect(api.command.mock.calls[1][2]).toEqual({type:'undo'});model.dispose();
});
