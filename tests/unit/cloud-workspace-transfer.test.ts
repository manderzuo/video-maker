import {expect,it} from 'vitest';
import {buildGraphDelta,applyGraphDelta} from '../../src/domain/cloud-workspace-transfer';
import type {Graph} from '../../src/domain/graph';
const node=(id:string)=>({id,type:'text' as const,title:id,x:0,y:0,locked:false,data:{kind:'text' as const,text:'保留的长正文'.repeat(1000),referenceTokens:[]}});
const before:Graph={projectId:'p',revision:5,nodes:[node('a'),node('b')],edges:[],viewport:{x:1,y:2,scale:1}};
it('transfers only changed nodes while preserving the authoritative graph and order',()=>{
 const after={...before,revision:6,nodes:[node('c'),{...node('a'),title:'已修改'}]};const delta=buildGraphDelta(before,after);
 expect(applyGraphDelta(before,delta)).toEqual(after);expect(delta.removedNodeIds).toEqual(['b']);
 const small={...before,revision:6,nodes:[before.nodes[0],{...before.nodes[1],x:50}]};
 const patch=buildGraphDelta(before,small);expect(patch.nodes.map(n=>n.id)).toEqual(['b']);expect(patch.nodeOrder).toBeUndefined();
});
it('rejects deltas for a different revision or project instead of losing an unsaved graph',()=>{
 const delta=buildGraphDelta(before,{...before,revision:6});
 expect(()=>applyGraphDelta({...before,revision:4},delta)).toThrow();expect(()=>applyGraphDelta({...before,projectId:'other'},delta)).toThrow();
});
