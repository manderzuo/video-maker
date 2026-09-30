import {promptCompileInputSchema,promptResultVersionSchema,type PromptCompileInput,type PromptResultVersion} from '../prompt';
import type {CapabilityProfile} from '../connection';
import type {ValidationIssue} from '../common';
import {resolveConstraints} from './constraints';
export function validatePromptResult(raw:PromptResultVersion,input:PromptCompileInput,caps:CapabilityProfile):ValidationIssue[]{
 const parsed=promptResultVersionSchema.safeParse(raw);const issues:ValidationIssue[]=[];
 const issue=(code:string,path:string,message:string)=>issues.push({code,path,message});
 if(!parsed.success)return parsed.error.issues.map(e=>({code:'result_schema_invalid',path:e.path.join('.'),message:e.message}));
 const result=parsed.data;input=promptCompileInputSchema.parse(input);
 if(!result.finalPrompt.trim())issue('result_empty','finalPrompt','结果正文不能为空。');
 const resolution=resolveConstraints(input);
 for(const conflict of resolution.conflicts)issue('constraint_conflict',`requestedSpec.${conflict.field}`,`需求 ${conflict.originalValue} 与表单 ${conflict.formValue} 尚未确认。`);
 input=resolution.resolved;
 const locks=[...input.lockedConstraints.filter(c=>c.locked)];
 if(!locks.some(c=>c.field==='personCount')){const count=input.userRequest.match(/([\d一二三四五六七八九十]+)\s*(?:位|个|名)\s*(?:人物|人|角色)/);if(count)locks.push({id:'detected-person-count',field:'personCount',originalValue:count[1],locked:true});}
 if(!locks.some(c=>c.field==='noCuts')&&/(不切镜|一镜到底|不要切镜)/.test(input.userRequest))locks.push({id:'detected-no-cuts',field:'noCuts',originalValue:'不切镜',locked:true});
 const segments=[result.finalPrompt,...result.shotPlan.map(s=>s.prompt)];
 for(const lock of locks){
  if(['durationSeconds','ratio'].includes(lock.field))continue;
  const expected=lock.acceptedValue??lock.originalValue;
  let changed=false;
  if(lock.field==='personCount'){const convert=(s:string)=>({一:'1',二:'2',三:'3',四:'4',五:'5',六:'6',七:'7',八:'8',九:'9',十:'10'}[s]??s);const counts=segments.flatMap(text=>[...text.matchAll(/([\d一二三四五六七八九十]+)\s*(?:位|个|名)\s*(?:人物|人|角色)/g)].map(m=>convert(m[1])));changed=!counts.length||counts.some(n=>n!==convert(expected));}
  else if(lock.field==='noCuts')changed=!/(不切镜|一镜到底|不要切镜)/.test(result.finalPrompt)||segments.some(text=>/(?:然后|随后|进行|直接|开始|快速)(?:切镜|转场|切换镜头)/.test(text));
  else changed=!result.finalPrompt.includes(expected)||result.shotPlan.some(s=>!s.prompt.includes(expected));
  if(changed)issue(`locked_${lock.field}_changed`,'finalPrompt',`锁定要求 ${lock.field}（${expected}）未完整保留，请人工检查。`);
 }
 if(caps.verification==='unknown')issue('capabilities_unverified','suggestedSpec','Core 能力未核验；仅可用于写作。');
 const {durationSeconds,ratio}=input.requestedSpec;
 if(durationSeconds!==undefined&&result.shotPlan.length&&Math.abs(result.shotPlan.reduce((n,s)=>n+s.durationSeconds,0)-durationSeconds)>1e-6)issue('shot_total_mismatch','shotPlan','分镜总时长与目标不一致。');
 if(new Set(result.shotPlan.map(s=>s.id)).size!==result.shotPlan.length)issue('shot_id_duplicate','shotPlan','镜头ID重复。');
 const knownSpecs=caps.videoSpecs.filter(s=>caps.videoModels.includes(s.modelId));
 for(const shot of result.shotPlan)if(!knownSpecs.some(s=>s.durationSeconds===shot.durationSeconds&&(!ratio||s.ratio===ratio)))issue('shot_duration_unsupported',`shotPlan.${shot.id}`,'镜头时长与画幅组合尚无已核验执行规格。');
 if((durationSeconds!==undefined||ratio)&&!knownSpecs.some(s=>(durationSeconds===undefined||s.durationSeconds===durationSeconds)&&(!ratio||s.ratio===ratio)))issue('execution_spec_unsupported','requestedSpec','全局创作规格不可直接用于单次任务；需核验或人工拆分。');
 if(result.suggestedSpec.durationSeconds!==durationSeconds||result.suggestedSpec.ratio!==ratio)issue('suggested_spec_changed','suggestedSpec','结果规格与已确认目标不同。');
 const aliases=new Set<string>();const assets=new Set<string>();
 for(const ref of input.references){if(aliases.has(ref.alias))issue('reference_alias_duplicate','references','引用别名重复。');aliases.add(ref.alias);if(ref.assetId){if(assets.has(ref.assetId))issue('reference_asset_duplicate','references','素材重复引用。');assets.add(ref.assetId);}if(!ref.assetId||!ref.available||ref.unbound)issue('reference_unbound',`references.${ref.alias}`,'引用没有可用的本地素材。');if(ref.mediaType==='audio'||/首帧|尾帧/.test(ref.role))issue('reference_role_unverified',`references.${ref.alias}`,'此引用角色需另行核验Core契约，当前仅用于写作。');}
 for(const token of new Set(segments.flatMap(text=>[...text.matchAll(/@(图片|视频|音频)\d+/g)].map(m=>m[0]))))if(!aliases.has(token))issue('reference_dangling','finalPrompt',`引用 ${token} 未关联素材。`);
 return issues;
}
