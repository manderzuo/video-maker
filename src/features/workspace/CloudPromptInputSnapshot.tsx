import type {PromptDraft} from '../../domain/prompt';
const fields:Record<string,string>={durationSeconds:'时长',ratio:'画幅',brand:'品牌原文',personCount:'人物数量',dialogue:'对白原文',noCuts:'镜头连续性',negative:'动作禁止项'};
export function CloudPromptInputSnapshot({input}:{input:PromptDraft}){
 return <><pre aria-label="任务输入快照">{input.userRequest}</pre><p>时长目标：{input.requestedSpec.durationSeconds===undefined?'未指定':input.requestedSpec.durationSeconds+' 秒'} · 画幅：{input.requestedSpec.ratio||'未指定'}</p><p>声音策略：{input.audioPlan||'未指定'}</p><h3>明确要求</h3>{input.lockedConstraints.length?input.lockedConstraints.map(lock=><p key={lock.id}>{fields[lock.field]??lock.field}：{lock.acceptedValue??lock.originalValue}{lock.locked?' · 已锁定':''}</p>):<p>无额外锁定要求</p>}<h3>参考素材描述</h3>{input.references.length?input.references.map((reference,index)=><p key={reference.alias+index}>{reference.alias} · {reference.role} · {reference.description||'未填写描述'}{reference.unbound||!reference.available?' · 尚未绑定可用素材':''}</p>):<p>无参考素材</p>}</>;
}
