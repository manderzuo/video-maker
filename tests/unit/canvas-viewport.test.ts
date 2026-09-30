import {describe,it,expect} from 'vitest';
import {f} from '../helpers/fixtures';
import {updateViewport} from '../../src/features/canvas/viewport';
import {selectNodes} from '../../src/features/canvas/selection';
import {nodeBounds} from '../../src/features/canvas/geometry';
const text={id:'t1',title:'文本',type:'text' as const,x:20,y:30,locked:true,data:{kind:'text' as const,text:'原创',referenceTokens:[]}};
describe('T13 geometry and viewport',()=>{
 it('rejects NaN and out of range scales without moving the view',()=>{const view={x:20,y:30,scale:1};for(const scale of [NaN,Infinity,.24,2.01])expect(updateViewport(view,{type:'zoom',scale,width:1000,height:800})).toEqual(view);});
 it('zoom preserves the world point at the center',()=>{expect(updateViewport({x:100,y:100,scale:1},{type:'zoom',scale:2,width:1000,height:800})).toEqual({x:-300,y:-200,scale:2});});
 it('fit uses exact 48px margin and empty canvas returns 100%',()=>{expect(updateViewport({x:2,y:3,scale:1},{type:'fit',bounds:{left:0,top:0,right:1000,bottom:500},width:1096,height:596})).toEqual({x:48,y:48,scale:1});expect(updateViewport({x:2,y:3,scale:2},{type:'fit',bounds:null,width:900,height:600})).toEqual({x:0,y:0,scale:1});});
 it('locked nodes remain selectable; nonexistent IDs cannot enter selection',()=>{const graph=f.graph({nodes:[text]});expect(selectNodes(graph,{type:'ids',ids:['t1','missing']})).toEqual(['t1']);expect(selectNodes(graph,{type:'rectangle',rect:{left:0,top:0,right:400,bottom:300}})).toEqual(['t1']);});
 it('group-relative children have world bounds; collapsed members are hidden',()=>{const group={id:'g1',title:'组',type:'group' as const,x:100,y:200,locked:false,data:{kind:'group' as const,childIds:['t1'],collapsed:true}},graph=f.graph({nodes:[text,group]});expect(nodeBounds([text],graph)).toEqual({left:120,top:230,right:440,bottom:410});expect(selectNodes(graph,{type:'ids',ids:['t1','g1']})).toEqual(['g1']);});
});
