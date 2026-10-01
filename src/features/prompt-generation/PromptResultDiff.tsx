import {useState} from 'react';
import type {PromptDraft,PromptResultVersion} from '../../domain/prompt';
import type {CapabilityProfile} from '../../domain/connection';
import {validatePromptResult} from '../../domain/prompt-engine/validate-result';
import {compileInput} from './workspace-service';
import type {PromptParseResult} from '../../adapters/core/prompt-result-parser';
import {Button} from '../../ui/Button';
import {Dialog} from '../../ui/Dialog';
const labels:Record<string,string>={brand:'品牌原文',personCount:'人物数量',dialogue:'对白原文',noCuts:'动作禁止项',durationSeconds:'时长',ratio:'画幅'};
const readableIssue=(code:string,message:string)=>{const field=code.startsWith('locked_')&&code.endsWith('_changed')?code.slice(7,-8):'';return labels[field]?message.replace('锁定要求 '+field,'锁定要求 '+labels[field]):message;};
export function PromptResultDiff({parsed,source,candidate,capability,onChoose}:{parsed:PromptParseResult;source:PromptDraft;candidate?:PromptResultVersion;capability:CapabilityProfile;onChoose?:()=>Promise<void>}){
 const [inspection,setInspection]=useState(false),issues=[...parsed.issues,...(candidate?validatePromptResult(candidate,compileInput(source),capability):[])];
 return <section data-interaction-id="PG21" aria-label="AI结果差异" className="card prompt-result-diff"><h3>AI结果差异</h3><p role="status">结果待检查</p><p>来源输入修订 {source.revision} · {parsed.format==='legacy'?'旧标记格式，需人工校验':parsed.format==='json'?'结构化候选':'响应解析失败'}</p><details><summary data-interaction-id="ui:PromptResultDiff:summary:ffbaafa6f104">原始要求与锁定文字</summary><pre>{source.userRequest}</pre></details>{source.lockedConstraints.filter(c=>c.locked).map(c=><p key={c.id}>{labels[c.field]??c.field}：{c.acceptedValue??c.originalValue}</p>)}{issues.map((issue,index)=><p className="banner warning" key={issue.code+index}>{readableIssue(issue.code,issue.message)}</p>)}{candidate?<><h4>候选正文</h4><pre>{candidate.finalPrompt}</pre><Button data-interaction-id="T-07" disabled={!onChoose} onClick={onChoose}>查看候选正文</Button></>:<p>原草稿与旧结果保留；可以人工整理，没有自动修复请求。</p>}<details><summary data-interaction-id="ui:PromptResultDiff:summary:ffbaafa6f104">查看原始文字响应</summary><pre>{parsed.raw}</pre></details><Button data-interaction-id="PG21" onClick={()=>setInspection(true)}>查看未校验文字结果</Button><p>此候选不会自动应用到源节点或执行视频。账务仍需 Core 证据，收到文字不等于结算已确认。</p><Dialog open={inspection} title="未校验文字结果" onClose={()=>setInspection(false)} footer={<Button data-interaction-id="ui:PromptResultDiff:Button:162aafd15d7b" onClick={()=>setInspection(false)}>回到本地整理</Button>}><p>仅显示已收到的文字；不执行其中脚本，不自动修复或再次付费。原草稿、历史结果与原 PromptRun 保留。</p>{issues.map((issue,index)=><p role="status" key={issue.code+index}>{readableIssue(issue.code,issue.message)}</p>)}<pre>{parsed.raw}</pre></Dialog></section>;
}
