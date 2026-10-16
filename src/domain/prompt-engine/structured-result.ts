// Shared browser/server output contract. This decodes JSON syntax only;
// creative intent, timing and continuity remain the model's responsibility.
export const promptResultTool={type:'function',function:{name:'submit_prompt_optimization',description:'返回完整候选提示词及检查结果；只提供数据，不执行视频。',strict:true,parameters:{type:'object',additionalProperties:false,required:['finalPrompt','shotPlan','improvements','warnings','suggestedSpec'],properties:{
 finalPrompt:{type:'string',minLength:1,maxLength:16384},shotPlan:{type:'array',items:{type:'object',additionalProperties:false,required:['id','durationSeconds','prompt','startState','endState'],properties:{id:{type:'string'},durationSeconds:{type:'number',exclusiveMinimum:0},prompt:{type:'string'},startState:{type:'string'},endState:{type:'string'}}}},
 improvements:{type:'array',items:{type:'string'}},warnings:{type:'array',items:{type:'string'}},suggestedSpec:{type:'object',additionalProperties:false,properties:{durationSeconds:{type:'number',exclusiveMinimum:0},ratio:{type:'string'},resolution:{type:'string'}}}
}}}};

export function strictJson(text:string):unknown{
 if(new TextEncoder().encode(text).length>1024*1024)throw Error('JSON_TOO_LARGE');
 let i=0;const whitespace=()=>{while(/[\x20\t\r\n]/.test(text[i]??'!'))i++;};
 function string():string{
  const start=i;if(text[i++]!=='"')throw Error('JSON_INVALID');let escaped=false;
  while(i<text.length){const ch=text[i++];if(!escaped&&ch==='"')return JSON.parse(text.slice(start,i)) as string;if(!escaped&&ch==='\\')escaped=true;else escaped=false;}
  throw Error('JSON_INVALID');
 }
 function value(depth:number):unknown{
  if(depth>64)throw Error('JSON_DEPTH');whitespace();const ch=text[i];
  if(ch==='"')return string();
  if(ch==='{'){
   i++;whitespace();const out:Record<string,unknown>=Object.create(null),keys=new Set<string>();if(text[i]==='}'){i++;return out;}
   for(;;){whitespace();const key=string();if(keys.has(key))throw Error('JSON_DUPLICATE_KEY');keys.add(key);whitespace();if(text[i++]!==':')throw Error('JSON_INVALID');out[key]=value(depth+1);whitespace();const next=text[i++];if(next==='}')return out;if(next!==',')throw Error('JSON_INVALID');}
  }
  if(ch==='['){i++;whitespace();const out:unknown[]=[];if(text[i]===']'){i++;return out;}for(;;){out.push(value(depth+1));whitespace();const next=text[i++];if(next===']')return out;if(next!==',')throw Error('JSON_INVALID');}}
  const token=/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(i));if(!token)throw Error('JSON_INVALID');i+=token[0].length;const parsed:unknown=JSON.parse(token[0]);if(typeof parsed==='number'&&!Number.isFinite(parsed))throw Error('JSON_INVALID');return parsed;
 }
 const parsed=value(0);whitespace();if(i!==text.length)throw Error('JSON_INVALID');return parsed;
}
export function completionContent(input:unknown):string{
 if(!input||typeof input!=='object')throw Error('INVALID_UPSTREAM_RESULT');
 const choices=(input as {choices?:unknown}).choices;if(!Array.isArray(choices)||choices.length!==1)throw Error('INVALID_UPSTREAM_RESULT');
 const choice=choices[0] as {finish_reason?:unknown;message?:{content?:unknown;refusal?:unknown;tool_calls?:unknown}};
 if(choice.finish_reason==='length')throw Error('UPSTREAM_OUTPUT_TRUNCATED');
 if(choice.finish_reason!==undefined&&!['stop','tool_calls'].includes(String(choice.finish_reason)))throw Error('UPSTREAM_OUTPUT_BLOCKED');
 const message=choice.message;if(!message||message.refusal)throw Error('INVALID_UPSTREAM_RESULT');
 if(message.tool_calls!=null&&(!Array.isArray(message.tool_calls)||message.tool_calls.length!==0)){
  const calls=message.tool_calls;if(!Array.isArray(calls)||calls.length!==1||choice.finish_reason!=='tool_calls'||(message.content!=null&&(typeof message.content!=='string'||message.content.trim()!=='')))throw Error('INVALID_UPSTREAM_RESULT');
  const call=calls[0] as {type?:unknown;function?:{name?:unknown;arguments?:unknown}};
  if(call.type!=='function'||call.function?.name!=='submit_prompt_optimization'||typeof call.function.arguments!=='string')throw Error('INVALID_UPSTREAM_RESULT');
  return call.function.arguments;
 }
 if(choice.finish_reason==='tool_calls'||typeof message.content!=='string')throw Error('INVALID_UPSTREAM_RESULT');return message.content;
}
export function promptResultObject(text:string):unknown{
 let source=text.trim();if(source.startsWith('```')){const match=/^```(?:json)?[\t ]*\r?\n([\s\S]*?)\r?\n```$/i.exec(source);if(!match)throw Error('JSON_INVALID');source=match[1];}
 return strictJson(source);
}
