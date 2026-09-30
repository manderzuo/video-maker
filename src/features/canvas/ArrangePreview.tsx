import type {Graph} from '../../domain/graph';
import {Dialog} from '../../ui/Dialog';
import {Button} from '../../ui/Button';
import type {PositionPatch} from './group-layout';
export function ArrangePreview({graph,patches,onClose,onApply}:{graph:Graph;patches:PositionPatch[]|null;onClose:()=>void;onApply:()=>Promise<void>}){return <Dialog open={patches!==null} title="预览布局" onClose={onClose} footer={<><Button onClick={onClose}>取消</Button><Button disabled={!patches?.length} onClick={onApply}>应用布局</Button></>}><p>仅修改以下坐标，输入顺序、依赖及任务快照保持原样。</p><table><thead><tr><th>节点</th><th>原坐标</th><th>建议坐标</th></tr></thead><tbody>{patches?.map(patch=>{const node=graph.nodes.find(n=>n.id===patch.nodeId);return <tr key={patch.nodeId}><td>{node?.title}</td><td>{node?.x}, {node?.y}</td><td>{Math.round(patch.x)}, {Math.round(patch.y)}</td></tr>;})}</tbody></table></Dialog>;}
