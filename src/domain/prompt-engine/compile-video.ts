// Pure chapter structure adapted from the frozen videoRules.js; see video-scenes.ts.
import {promptCompileInputSchema,promptCompileResultSchema,type PromptCompileInput,type PromptCompileResult} from '../prompt';
import {byteLength} from '../common';
import {VIDEO_SCENES} from './video-scenes';
export const VIDEO_RULE_VERSION='studio-video-rules-v1';
export function compileVideoPrompt(raw:PromptCompileInput):PromptCompileResult{
 const input=promptCompileInputSchema.parse(raw);
 if(!input.userRequest.trim())throw new Error('prompt_input_empty');
 const scene=VIDEO_SCENES.find(item=>item.id===input.sceneId);
 if(!scene)throw new Error('prompt_scene_unknown');
 const {durationSeconds,ratio}=input.requestedSpec;
 const warnings=['规则整理草稿须人工检查；模型、时长、画幅与参考上限须由 Core 契约核验。'];
 if(!durationSeconds||!ratio)warnings.push('时长或画幅未指定；本地写作不证明 Core 可执行。');
 const references=input.references.map(ref=>{
  const bound=!!ref.assetId&&ref.available&&!ref.unbound;
  if(!bound)warnings.push(`参考 ${ref.alias} 未绑定可用素材；仅保留写作说明。`);
  return `${ref.alias}：${ref.role}；${ref.description}；${bound?'本地素材已关联（远端能力未核验）':'未绑定，仅写作说明'}`;
 });
 const finalPrompt=[
  `视频任务：${input.userRequest}`,
  `创作方向：${scene.title}。${scene.guidance}`,
  '约束优先级：用户明确要求及已确认约束优先；下列写作建议仅在不冲突时适用。不得增改品牌汉字、人物数量或对白。',
  `目标规格：时长 ${durationSeconds===undefined?'未指定':durationSeconds+' 秒'}；画幅 ${ratio??'未指定'}。这是创作目标，尚非执行许可。`,
  '主体与场景：明确主体身份、外观、位置、环境、时间、空间层级和情绪；只保留与任务有关的元素。',
  '动作与叙事：按先后顺序写清动作起点、过程、结果和主体互动。',
  '镜头与节奏：描述景别、视角、运镜方向、速度和焦点；只有用户允许时才安排切镜或转场。',
  '连续性：保持主体外观、服装、道具、空间方向和光线逻辑稳定，除非用户明确要求变化。',
  `参考素材：${references.length?references.join('\n'):'无已绑定参考素材；仅根据文字要求编写。'}`,
  `声音设计：${input.audioPlan||'未指定；不得擅自添加对白。'}`,
  ...input.lockedConstraints.filter(c=>c.locked).map(c=>{
   const value=c.acceptedValue??c.originalValue;
   if(c.field==='personCount'&&/^(?:\d+|[一二三四五六七八九十]+)$/.test(value))return `已锁定人物数量：${value}位人物`;
   return `已锁定 ${c.field}：${value}`;
  }),
  '负面约束：避免主体变形、身份漂移、道具凭空消失、动作跳跃和无关文字、水印；保留用户明确要求的文字与品牌。',
 ].join('\n');
 if(byteLength(finalPrompt)>65536)throw new Error('prompt_compiled_too_large');
 return promptCompileResultSchema.parse({finalPrompt,shotPlan:durationSeconds?[{id:'local-shot-1',durationSeconds,prompt:finalPrompt,startState:'按原始需求建立主体与场景',endState:'保持需求指定的结束状态'}]:[],improvements:['规则整理草稿'],warnings,suggestedSpec:{...input.requestedSpec}});
}
