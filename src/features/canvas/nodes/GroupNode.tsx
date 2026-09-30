export function GroupNode({count,collapsed}:{count:number;collapsed:boolean}){return <div><p>{count} 个成员 · {collapsed?'已收起':'已展开'}</p><small>仅组织布局，不自动发送成员内容。</small></div>;}
