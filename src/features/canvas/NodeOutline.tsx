import {useState} from 'react';
import type {Graph} from '../../domain/graph';
import {Button} from '../../ui/Button';
import {visibleNodes} from './geometry';
export function NodeOutline({graph,selected,onSelect,onLocate}:{graph:Graph;selected:string[];onSelect:(ids:string[])=>void;onLocate:(ids:string[])=>void}){
 const [query,setQuery]=useState(''),[type,setType]=useState('all'),[sort,setSort]=useState('scene');
 const nodes=visibleNodes(graph).filter(n=>n.title.includes(query.trim())&&(type==='all'||type===n.type)).slice().sort((a,b)=>sort==='title'?a.title.localeCompare(b.title):((a.type==='group'?a.data.shotOrder??0:Infinity)-(b.type==='group'?b.data.shotOrder??0:Infinity))||graph.nodes.indexOf(a)-graph.nodes.indexOf(b));
 return <aside className="canvas-outline"><h2>节点大纲</h2><label>查找节点<input value={query} onChange={e=>setQuery(e.target.value)}/></label><label>节点类型<select value={type} onChange={e=>setType(e.target.value)}><option value="all">全部</option><option value="text">文本</option><option value="asset">素材</option><option value="video-generation">视频草稿</option><option value="result">固定结果</option><option value="group">镜头分组</option></select></label><label>大纲排序<select value={sort} onChange={e=>setSort(e.target.value)}><option value="scene">镜头序号</option><option value="title">名称</option></select></label>{!nodes.length?<p>没有匹配节点</p>:null}<ul>{nodes.map(node=><li key={node.id}><label><input type="checkbox" aria-label={'选择 '+node.title} checked={selected.includes(node.id)} onChange={e=>onSelect(e.target.checked?[...selected,node.id]:selected.filter(id=>id!==node.id))}/>{node.title}{node.locked?' · 已锁定':''}</label><Button aria-label={'定位 '+node.title} onClick={()=>onLocate([node.id])}>◎</Button></li>)}</ul></aside>;
}
