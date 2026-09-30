import type {Graph} from '../../domain/graph';
import {nodeRect,visibleNodes,type Rect} from './geometry';
export type SelectionQuery={type:'ids';ids:string[]}|{type:'rectangle';rect:Rect};
export function selectNodes(graph:Graph,query:SelectionQuery):string[]{
 return visibleNodes(graph).filter(node=>{if(query.type==='ids')return query.ids.includes(node.id);const n=nodeRect(node,graph),r=query.rect;return n.left>=r.left&&n.top>=r.top&&n.right<=r.right&&n.bottom<=r.bottom;}).map(n=>n.id);
}
