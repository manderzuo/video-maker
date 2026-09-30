import {it,expect} from 'vitest';
import {f} from '../helpers/fixtures';
import {nodeSchema,type CanvasNode,type Edge} from '../../src/domain/graph';
import {validateConnection,getOrderedInputs} from '../../src/domain/graph-validation';
import {IDBFactory} from 'fake-indexeddb';
import {openStudioDb,transact,requestResult} from '../../src/infrastructure/storage/database';
import {acquireProjectLease} from '../../src/infrastructure/storage/project-lease';
import {applyUiCommand} from '../../src/application/commands/apply-command';
const nodes:CanvasNode[]=[{id:'t',type:'text',title:'文字',x:0,y:0,locked:false,data:{kind:'text',text:'创意',referenceTokens:[]}},{id:'a',type:'asset',title:'图片',x:0,y:0,locked:false,data:{kind:'asset',assetId:'a1'}},{id:'v',type:'video-generation',title:'视频',x:0,y:0,locked:false,data:{kind:'video-generation',draft:{modelId:'draft-only'},inputBindings:[],stale:false}},{id:'g',type:'group',title:'组',x:0,y:0,locked:false,data:{kind:'group',childIds:[],collapsed:false}}];
const edge:Edge={id:'e',sourceId:'t',targetId:'v',port:'text',order:0};
it('T14 N02 title limits apply to the shared schema, including Agent commands',()=>{for(const title of ['',' ','中'.repeat(61),'😀'.repeat(61)])expect(nodeSchema.safeParse({...nodes[0],title}).success).toBe(false);expect(nodeSchema.safeParse({...nodes[0],title:'😀'.repeat(60)}).success).toBe(true);});
it('T14-C01 rejects self, missing, wrong output/target type, implicit group and cycles',()=>{
 const graph=f.graph({nodes});for(const patch of [{sourceId:'v'},{targetId:'missing'},{port:'image' as const},{targetId:'a'},{sourceId:'g'}])expect(validateConnection(graph,{...edge,...patch},f.unknownCaps()).ok).toBe(false);
 expect(validateConnection({...graph,edges:[{...edge,id:'back',sourceId:'v',targetId:'t'}]},edge,f.unknownCaps()).ok).toBe(false);
});
it('T14-C01 limits use explicit reviewed contract values, preserve all references instead of truncating',()=>{
 const graph=f.graph({nodes,edges:[{...edge,id:'first'}]}),media={...edge,id:'second',sourceId:'a',port:'image' as const,order:1},assets=[f.asset({mediaType:'image'})];expect(validateConnection(graph,media,f.caps(),{assets,limits:{image:0}}).ok).toBe(false);expect(validateConnection(graph,media,f.caps(),{assets,limits:{image:1}}).ok).toBe(true);expect(graph.edges).toHaveLength(1);
});
it('T14-C02 explicit order does not depend on node layout or array order',()=>{const graph=f.graph({nodes,edges:[{...edge,id:'image',sourceId:'a',port:'image',order:2},{...edge,order:0}]});const expected=getOrderedInputs(graph,'v');graph.nodes.reverse();for(const node of graph.nodes){node.x=999;node.y=-30;}expect(getOrderedInputs(graph,'v')).toEqual(expected);expect(expected.map(i=>i.nodeId)).toEqual(['t','a']);});
it('T14-C03 ordered result input retains asset/run identity',()=>{const result:CanvasNode={id:'r',type:'result',title:'结果',x:0,y:0,locked:false,data:{kind:'result',assetId:'result-a',runId:'run-1'}};expect(getOrderedInputs(f.graph({nodes:[...nodes,result],edges:[{...edge,sourceId:'r',port:'video'}]}),'v')).toEqual([{nodeId:'r',assetId:'result-a',runId:'run-1',order:0,role:'video'}]);});
it('T14 typed validation is enforced in the actual command transaction, and changes mark downstream stale without editing Run',async()=>{
 const db=await openStudioDb({factory:new IDBFactory(),name:'typed'});try{await transact(db,['projects','graphs','assets','runs'],'readwrite',tx=>{tx.objectStore('projects').put(f.project());tx.objectStore('graphs').put(f.graph({nodes}));tx.objectStore('assets').put(f.asset({mediaType:'image'}));tx.objectStore('runs').put(f.run());});const acquired=await acquireProjectLease('p1','typed',Date.now(),{db});if(!acquired.ok)throw new Error('setup');const input={id:'bad',projectId:'p1',baseRevision:1,operations:[{id:'op',type:'add_edge' as const,payload:{edge:{...edge,port:'image'}}}]};expect((await applyUiCommand(input,{db,lease:acquired.token})).errorCode).toBe('edge_port_type');expect((await applyUiCommand({...input,id:'good',operations:[{id:'op2',type:'add_edge',payload:{edge}}]},{db,lease:acquired.token})).status).toBe('applied');const stored=await transact(db,['graphs','runs'],'readonly',async tx=>({graph:await requestResult(tx.objectStore('graphs').get('p1')),run:await requestResult(tx.objectStore('runs').get('r1'))}));expect(stored.graph.nodes.find((n:CanvasNode)=>n.id==='v').data).toMatchObject({stale:true,inputBindings:[{nodeId:'t',order:0,role:'text'}]});expect(stored.run).toEqual(f.run());}finally{db.close();}
});
