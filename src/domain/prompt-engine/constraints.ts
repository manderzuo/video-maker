import {promptCompileInputSchema,type PromptCompileInput} from '../prompt.js';
export type ConstraintResolution={conflicts:{field:string;originalValue:string;formValue:string}[];readyForAI:boolean;resolved:PromptCompileInput};
// Revision/continuation envelopes retain historical context for the model, but
// only the current request defines the output specification.
function currentRequest(text:string):string{
 try{
  const value:unknown=JSON.parse(text);
  if(!value||typeof value!=='object'||Array.isArray(value))return text;
  const request=value as Record<string,unknown>;
  if(request.任务==='针对原视频修正错误'&&typeof request.当前完整提示词==='string')return request.当前完整提示词+'\n'+(typeof request.本次修正要求==='string'?request.本次修正要求:'');
  if(request.任务==='尾帧续写'&&typeof request.续写要求==='string')return request.续写要求;
 }catch{/* Ordinary prose is not an envelope. */}
 return text;
}
function durationEvidence(text:string):{values:string[];timelineEnd:number}{
 const intervals:RegExpMatchArray[]=[];
 for(const match of text.matchAll(/(\d+(?:\.\d+)?)\s*(?:秒\s*)?(?:[-—–~～]|至|到)\s*(\d+(?:\.\d+)?)\s*秒/g)){
  const prefix=text.slice(0,match.index),sentence=prefix.slice(Math.max(prefix.lastIndexOf('。'),prefix.lastIndexOf('\n'))+1);
  const previous=intervals.at(-1);
  const totalRange=/(?:总时长|时长|持续|总共|片长|视频长度|总长|时长目标)\s*[:：为约]?\s*$/.test(sentence);
  const timeline=/(?:时间轴|时间段|分镜时间|动作时序|镜头时序)\s*[:：]?/.test(sentence)||/(?:时间轴|时间段|分镜时间|动作时序|镜头时序)\s*[:：]?\s*$/.test(prefix)||Number(match[1])===0||previous&&Number(previous[2])===Number(match[1]);
  if(Number(match[2])>Number(match[1])&&!totalRange&&timeline)intervals.push(match);
 }
 return {values:[...new Set([...text.matchAll(/(\d+(?:\.\d+)?)\s*秒/g)].filter(match=>!intervals.some(interval=>match.index>=interval.index!&&match.index<interval.index!+interval[0].length)).map(match=>String(Number(match[1]))))],timelineEnd:Math.max(0,...intervals.map(interval=>Number(interval[2])))};
}
export function resolveConstraints(raw:PromptCompileInput):ConstraintResolution{
 const input=promptCompileInputSchema.parse(raw);const resolved=structuredClone(input);
 const request=currentRequest(input.userRequest);
 const durations=durationEvidence(request);
 const conflicts:ConstraintResolution['conflicts']=[];
 const candidates:{field:'durationSeconds'|'ratio';values:string[]}[]=[
  {field:'durationSeconds',values:durations.values},
  {field:'ratio',values:[...new Set([...request.matchAll(/(\d+(?:\.\d+)?)\s*[:：]\s*(\d+(?:\.\d+)?)/g)].map(m=>`${m[1]}:${m[2]}`))]},
 ];
 for(const {field,values} of candidates){
  const locks=input.lockedConstraints.filter(c=>c.locked&&c.field===field);
  const accepted=locks.filter(c=>c.acceptedValue!==undefined).map(c=>c.acceptedValue!);
  if(new Set(accepted).size>1)throw new Error('prompt_resolution_invalid');
  if(accepted.length){
   const value=accepted[0];
   if(field==='durationSeconds'){const n=Number(value);if(!/^\d+(?:\.\d+)?$/.test(value)||!Number.isFinite(n)||n<=0)throw new Error('prompt_resolution_invalid');resolved.requestedSpec.durationSeconds=n;}
   else {if(!/^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/.test(value))throw new Error('prompt_resolution_invalid');resolved.requestedSpec.ratio=value;}
   continue;
  }
  const all=[...new Set([...values,...locks.map(c=>c.originalValue)])];
  const form=input.requestedSpec[field];
  if(all.length>1){conflicts.push({field,originalValue:all.join(' / '),formValue:form===undefined?'未指定':String(form)});continue;}
  if(!all.length)continue;
  if(form!==undefined&&String(form)!==all[0])conflicts.push({field,originalValue:all[0],formValue:String(form)});
  else if(form===undefined){if(field==='durationSeconds'){const n=Number(all[0]);if(!Number.isFinite(n)||n<=0)throw new Error('prompt_resolution_invalid');resolved.requestedSpec.durationSeconds=n;}else resolved.requestedSpec.ratio=all[0];}
 }
 if(resolved.requestedSpec.durationSeconds!==undefined&&durations.timelineEnd>resolved.requestedSpec.durationSeconds&&!conflicts.some(conflict=>conflict.field==='durationSeconds'))conflicts.push({field:'durationSeconds',originalValue:`时间轴终点 ${durations.timelineEnd} 秒`,formValue:String(resolved.requestedSpec.durationSeconds)});
 // Deliberately limited, explainable detection; this is not semantic understanding.
 const literalFields:Record<string,string[]>={
  brand:[...input.userRequest.matchAll(/品牌\s*[:：为]\s*[“"「]?([^，,。\n”"」]+)/g)].map(m=>m[1].trim()),
  personCount:[...input.userRequest.matchAll(/(\d+)\s*(?:位|个|名)\s*(?:人物|人|角色)/g)].map(m=>m[1]),
  dialogue:[...input.userRequest.matchAll(/(?:台词|对白)\s*[:：]?\s*[“"「]([^”"」]+)[”"」]/g)].map(m=>m[1]),
 };
 for(const lock of input.lockedConstraints.filter(c=>c.locked&&c.acceptedValue===undefined)){
  const found=literalFields[lock.field];
  if(found?.length&&!found.includes(lock.originalValue))conflicts.push({field:lock.field,originalValue:found.join(' / '),formValue:lock.originalValue});
 }
 return {conflicts,readyForAI:conflicts.length===0,resolved};
}
