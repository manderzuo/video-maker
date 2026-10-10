import {expect,it,vi} from 'vitest';
import {createCloudCanvasModel} from '../../src/features/workspace/cloud-canvas-model';
import type {WorkspaceClient} from '../../src/infrastructure/api/workspace-client';
const project={id:'11111111-1111-4111-8111-111111111111',schemaVersion:1 as const,title:'云端',description:'',tags:[],revision:0,createdAt:1,updatedAt:1,archived:false,trashedAt:null};
const graph={projectId:project.id,revision:0,nodes:[],edges:[],viewport:{x:0,y:0,scale:1}};
const snapshot={project,graph,history:{undoDepth:0,redoDepth:0}};
const node={id:'node',type:'text' as const,title:'文字',x:0,y:0,locked:false,data:{kind:'text' as const,text:'不丢失的输入',referenceTokens:[]}};
const operation={id:'op',type:'add_node' as const,payload:{node}};
it('merges only appended server results while preserving dirty text and viewport',async()=>{
 const api=client(),model=createCloudCanvasModel(project.id,api);await model.load();model.stage([operation]);model.viewport({x:77,y:22,scale:1});
 const result={id:'result',type:'result' as const,title:'完成的视频',x:500,y:0,locked:false,data:{kind:'result' as const,assetId:'asset',runId:'run',generationLinked:true}};
 api.readWorkspace.mockResolvedValueOnce({...snapshot,graph:{...graph,revision:1,nodes:[result]} as typeof graph,project:{...project,revision:1}});
 await model.refreshResults();expect(model.getState()).toMatchObject({status:'dirty',pending:[operation],graph:{revision:1,nodes:[result,node],viewport:{x:77,y:22,scale:1}}});
 await model.save();expect(api.command).toHaveBeenCalledWith(project.id,1,{type:'operations',operations:[operation],viewport:{x:77,y:22,scale:1}},expect.any(String));model.dispose();
});
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
it('saves prolonged typing as one final edit while preserving structural operation order',async()=>{
 const api=client(),model=createCloudCanvasModel(project.id,api);await model.load();model.stage([operation]);
 for(let index=0;index<600;index++)model.stage([{id:'typing-'+index,type:'update_node',payload:{nodeId:node.id,patch:{data:{...node.data,text:'正文 '+index}}}}]);
 await model.save();const command=api.command.mock.calls[0][2];expect(command.type).toBe('operations');if(command.type!=='operations')throw new Error('Missing creative command');
 expect(command.operations).toHaveLength(2);expect(command.operations[0]).toEqual(operation);expect(command.operations[1].payload).toMatchObject({patch:{data:{text:'正文 599'}}});model.dispose();
});

it('autosaves after editing settles and waits for the server receipt',async()=>{
 vi.useFakeTimers();const api=client(),model=createCloudCanvasModel(project.id,api,{autosaveMs:1500});
 try{await model.load();model.stage([operation]);await vi.advanceTimersByTimeAsync(1000);model.viewport({x:20,y:30,scale:1.5});await vi.advanceTimersByTimeAsync(1000);expect(api.command).not.toHaveBeenCalled();await vi.advanceTimersByTimeAsync(500);expect(api.command).toHaveBeenCalledTimes(1);expect(api.command.mock.calls[0][2]).toMatchObject({type:'operations',viewport:{x:20,y:30,scale:1.5}});expect(model.getState().status).toBe('saved');}finally{model.dispose();vi.useRealTimers();}
});
it('keeps failed autosave input for an explicit identical retry and never retries in the background',async()=>{
 vi.useFakeTimers();const api=client();api.command.mockRejectedValueOnce(new Error('network'));const model=createCloudCanvasModel(project.id,api,{autosaveMs:1500});
 try{await model.load();model.stage([operation]);await vi.advanceTimersByTimeAsync(2000);expect(model.getState()).toMatchObject({status:'failed',graph:{nodes:[node]}});await vi.advanceTimersByTimeAsync(10000);expect(api.command).toHaveBeenCalledTimes(1);await model.save();expect(api.command.mock.calls[1]).toEqual(api.command.mock.calls[0]);}finally{model.dispose();vi.useRealTimers();}
});
it('waits for composition to finish and cancels autosave when the account editor is disposed',async()=>{
 vi.useFakeTimers();const api=client(),model=createCloudCanvasModel(project.id,api,{autosaveMs:1500});
 try{await model.load();model.setComposing(true);model.stage([operation]);await vi.advanceTimersByTimeAsync(10000);expect(api.command).not.toHaveBeenCalled();model.setComposing(false);await vi.advanceTimersByTimeAsync(1000);expect(api.command).not.toHaveBeenCalled();model.dispose();await vi.advanceTimersByTimeAsync(10000);expect(api.command).not.toHaveBeenCalled();}finally{model.dispose();vi.useRealTimers();}
});
