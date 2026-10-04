import {it,expect} from 'vitest';
import {f} from '../helpers/fixtures';
import type {CanvasNode} from '../../src/domain/graph';
import {createBranch} from '../../src/features/canvas/branch-command';
import {nodeRect} from '../../src/features/canvas/geometry';
import {executeGraphOperations} from '../../src/application/commands/registry';

const text:CanvasNode={id:'source',title:'原提示词',type:'text',x:100,y:100,locked:false,data:{kind:'text',text:'鹈鹕骑自行车',referenceTokens:[]}};
const occupied:CanvasNode={id:'occupied',title:'已有草稿',type:'video-generation',x:468,y:100,locked:false,data:{kind:'video-generation',draft:{modelId:'seedance'},inputBindings:[],stale:false}};
const group:CanvasNode={id:'group',title:'分组',type:'group',x:800,y:600,locked:false,data:{kind:'group',childIds:['source'],collapsed:false}};
it.each([
 {name:'a single source',nodes:[text]},
 {name:'an occupied downstream position',nodes:[text,occupied]},
 {name:'a source inside a world-positioned group',nodes:[text,group]},
])('QA32 creating a video flow keeps existing nodes visible for $name',({nodes})=>{
 const graph=f.graph({nodes:structuredClone(nodes)}),before=structuredClone(graph);
 const next=executeGraphOperations(graph,createBranch(graph,'source',{defaultDraft:{modelId:'seedance'}}));
 const branch=next.nodes.find(n=>!before.nodes.some(old=>old.id===n.id))!;
 const box=nodeRect(branch,next);
 for(const old of before.nodes){
  const original=nodeRect(old,before);
  expect(box.left>=original.right||box.right<=original.left||box.top>=original.bottom||box.bottom<=original.top).toBe(true);
  expect(next.nodes.find(n=>n.id===old.id)).toEqual(old);
 }
 expect(graph).toEqual(before);
 expect(next.edges).toHaveLength(1);
 expect(next.edges[0]).toMatchObject({sourceId:'source',targetId:branch.id,port:'text'});
 expect(branch.data).toMatchObject({draft:{modelId:'seedance'},inputBindings:[],stale:true});
});
