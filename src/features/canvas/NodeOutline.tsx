import {useState} from 'react';
import type {Graph} from '../../domain/graph';
import {Button} from '../../ui/Button';
export function NodeOutline({graph,selected,onSelect,onLocate}:{graph:Graph;selected:string[];onSelect:(ids:string[])=>void;onLocate:(ids:string[])=>void}){
 const [query,setQuery]=useState('');
 return <aside className="canvas-outline"><h2>节点大纲</h2><label>查找节点<input value={query} onChange={e=>setQuery(e.target.value)}/></label><ul>{graph.nodes.filter(n=>n.title.includes(query.trim())).map(node=><li key={node.id}><label><input type="checkbox" aria-label={'选择 '+node.title} checked={selected.includes(node.id)} onChange={e=>onSelect(e.target.checked?[...selected,node.id]:selected.filter(id=>id!==node.id))}/>{node.title}{node.locked?' · 已锁定':''}</label><Button aria-label={'定位 '+node.title} onClick={()=>onLocate([node.id])}>◎</Button></li>)}</ul></aside>;
}
