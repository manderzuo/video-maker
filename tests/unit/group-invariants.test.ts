import {it,expect} from 'vitest';
import {graphSchema,type CanvasNode} from '../../src/domain/graph';
import {f} from '../helpers/fixtures';
const group=(id:string,childIds:string[]):CanvasNode=>({id,type:'group',title:'镜头组',x:0,y:0,locked:false,data:{kind:'group',childIds,collapsed:false}});
it('T15 groups reject self/nested cycles and references to missing children',()=>{for(const nodes of [[group('g',['g'])],[group('g',['missing'])],[group('g',['h']),group('h',['g'])]])expect(graphSchema.safeParse(f.graph({nodes})).success).toBe(false);});
it('T15 each child has one layout parent and no duplicate membership',()=>{const child:CanvasNode={id:'t',type:'text',title:'正文',x:0,y:0,locked:false,data:{kind:'text',text:'',referenceTokens:[]}};for(const groups of [[group('g',['t','t'])],[group('g',['t']),group('h',['t'])]])expect(graphSchema.safeParse(f.graph({nodes:[child,...groups]})).success).toBe(false);});
