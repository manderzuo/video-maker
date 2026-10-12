import {expect,it} from 'vitest';
import {f} from '../helpers/fixtures';
import {buildPromptOptimizationRequest} from '../../src/domain/prompt-engine/optimization-request';
import {validatePromptTextResult} from '../../src/domain/prompt-engine/validate-result';

const spec={durationSeconds:15,ratio:'9:16',resolution:'480p'};
it.each([
 '【时间轴】0–5秒：近景；1.2秒角色甲抬手，1.8秒碰到衣领，2.0秒人物转头，9.6秒台词结束。5–10秒：中景。10–15秒：近景。',
 '时间轴：１．２秒角色进入；９．６秒人物闭眼。',
 '第1.2秒角色走进来，演员在9.6秒重新坐下。',
 '角色的入画时间为一秒二；九点六秒台词结束。',
 '动作在1200毫秒开始，声音在9600ms结束。',
 'Timeline: 00:01.200 actor enters; 00:09.600 dialogue ends.',
 '00:00:01.200人物走近；00:00:09.600人物坐下。',
 '1.2s actor lifts an arm; 9.6 seconds dialogue ends.',
 '0.02分钟人物出现，0.16min演员转身。',
 '先停顿片刻，约一秒半后角色走近，再过两秒人物转身。',
 't=1.2s：人物甲抬手，t=9.6s：人物乙进入。',
 '角色进入在1-2秒，另一角色出现在3至4秒。',
 '前2秒建立场景；第3秒开始跟拍；最后1秒保持静止。',
 '人物旁白：“等我20秒，我一分钟后回来。”画面持续15秒。',
 '原片30秒，新增片段15秒；延续原片的画幅16:9，当前输出9:16。',
 '原要求总时长5秒，现按表单15秒执行。',
 '时长未在创意里写明，仍使用界面选定规格。',
 '总时长30秒，画幅16:9。',
 '人物在第20秒出场，视频界面目前选择15秒。',
 '旁白持续4.8秒，镜头停留5秒，整片15秒。',
 '主体在3秒片段中出现，当前界面选择15秒。',
 '人物在0:03出现，画幅9:16。',
])('passes creative semantics to AI unchanged instead of interpreting locally: %s',userRequest=>{
 const body=JSON.parse(buildPromptOptimizationRequest(f.draft({userRequest,sceneId:'edit',requestedSpec:spec}),'model',[]));
 const content=JSON.parse(body.messages[1].content);
 expect(content.userRequest).toBe(userRequest);expect(content.requestedSpec).toEqual(spec);
 expect(content.semanticReview).toMatchObject({performedBy:'model',specificationAuthority:'requestedSpec-and-acceptedValue',unresolvedConflictOutput:'warnings',inferUnspecifiedSpecification:false});
});
it('does not adopt a natural-language duration or ratio when the form leaves them unspecified',()=>{
 const body=JSON.parse(buildPromptOptimizationRequest(f.draft({userRequest:'总时长15秒，9:16。',sceneId:'edit',requestedSpec:{}}),'model',[]));
 expect(JSON.parse(body.messages[1].content).requestedSpec).toEqual({});
});
it('still rejects invalid or contradicting explicit specification choices',()=>{
 for(const acceptedValues of [['0'],['5','15'],['NaN']]){
  const lockedConstraints=acceptedValues.map((acceptedValue,index)=>({id:String(index),field:'durationSeconds',originalValue:'15',acceptedValue,locked:true}));
  expect(()=>buildPromptOptimizationRequest(f.draft({requestedSpec:spec,lockedConstraints}),'model',[])).toThrow('prompt_resolution_invalid');
 }
 expect(()=>buildPromptOptimizationRequest(f.draft({requestedSpec:spec,lockedConstraints:[{id:'d',field:'durationSeconds',originalValue:'5',locked:true}]}),'model',[])).toThrow('prompt_constraint_conflict');
});
it('retains accepted choices and explicit text locks without comparing them to creative prose',()=>{
 const draft=f.draft({userRequest:'旧画幅16:9，原片5秒。品牌：历史品牌。',sceneId:'edit',requestedSpec:spec,lockedConstraints:[{id:'d',field:'durationSeconds',originalValue:'5',acceptedValue:'15',locked:true},{id:'b',field:'brand',originalValue:'当前品牌',locked:true}]});
 const body=JSON.parse(buildPromptOptimizationRequest(draft,'model',[])),content=JSON.parse(body.messages[1].content);
 expect(content.userRequest).toBe(draft.userRequest);expect(content.requestedSpec).toEqual(spec);
 expect(content.lockedConstraints).toContainEqual({field:'brand',originalValue:'当前品牌',locked:true});
});
it('does not re-run creative-text heuristics on an AI result and retains numerical checks',()=>{
 const input=f.promptInput({userRequest:'0:01角色走近；1.2秒人物甲抬手；9.6秒台词结束。',requestedSpec:spec});
 const result={...f.promptResult({finalPrompt:'人物甲走近并抬手，保持场景连续。',shotPlan:[{id:'one',durationSeconds:15,prompt:'完整镜头',startState:'起始',endState:'结束'}],suggestedSpec:spec}),id:'v',origin:'ai' as const,sourceRevision:0,validationState:'unchecked' as const,createdAt:1};
 expect(validatePromptTextResult(result,input)).toEqual([]);
 expect(validatePromptTextResult({...result,shotPlan:[{...result.shotPlan[0],durationSeconds:10}]},input).map(issue=>issue.code)).toContain('shot_total_mismatch');
 expect(validatePromptTextResult({...result,suggestedSpec:{...spec,durationSeconds:10}},input).map(issue=>issue.code)).toContain('suggested_spec_changed');
});
it('requires review when the model reports an unresolved semantic conflict',()=>{
 const input=f.promptInput({userRequest:'第20秒角色入画。',requestedSpec:spec});
 const result={...f.promptResult({suggestedSpec:spec,warnings:['当前15秒时长无法容纳第20秒入画，需确认时长或调整入画时间。']}),id:'v',origin:'ai' as const,sourceRevision:0,validationState:'unchecked' as const,createdAt:1};
 expect(validatePromptTextResult(result,input).map(issue=>issue.code)).toEqual(['ai_review_required']);
});
