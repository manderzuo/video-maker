import {promptCompileInputSchema,type PromptCompileInput} from '../prompt.js';
export type ConstraintResolution={conflicts:{field:string;originalValue:string;formValue:string}[];readyForAI:boolean;resolved:PromptCompileInput};
export function resolveConstraints(raw:PromptCompileInput):ConstraintResolution{
 const input=promptCompileInputSchema.parse(raw);const resolved=structuredClone(input);
 const conflicts:ConstraintResolution['conflicts']=[];
 const candidates:{field:'durationSeconds'|'ratio';values:string[]}[]=[
  {field:'durationSeconds',values:[...new Set([...input.userRequest.matchAll(/(\d+(?:\.\d+)?)\s*秒/g)].map(m=>String(Number(m[1]))))]},
  {field:'ratio',values:[...new Set([...input.userRequest.matchAll(/(\d+(?:\.\d+)?)\s*[:：]\s*(\d+(?:\.\d+)?)/g)].map(m=>`${m[1]}:${m[2]}`))]},
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
