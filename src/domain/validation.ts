import {z} from 'zod';
import {projectSchema,type Project} from './project';
import {graphSchema,type Graph} from './graph';
import {runSchema,type Run} from './run';
import {byteLength,localText,bindingSchema,type RunBinding,type ValidationResult} from './common';
export function validate<T>(schema:z.ZodType<T>,input:unknown):ValidationResult<T>{
 const result=schema.safeParse(input);
 return result.success?{ok:true,value:result.data}:{ok:false,issues:result.error.issues.map(issue=>({code:issue.code,path:issue.path.join('.'),message:issue.message}))};
}
export function validateProject(input:unknown):ValidationResult<Project>{
 if(input&&typeof input==='object'&&'schemaVersion' in input&&typeof input.schemaVersion==='number'&&input.schemaVersion>1)return {ok:false,issues:[{code:'schema_too_new',path:'schemaVersion',message:'新版项目仅可保留与只读检查，禁止降级覆写'}]};
 return validate(projectSchema,input);
}
export const validateGraph=(input:unknown):ValidationResult<Graph>=>validate(graphSchema,input);
export const validateRun=(input:unknown):ValidationResult<Run>=>validate(runSchema,input);
export const validateLocalText=(text:string)=>validate(localText,text);
export function validateOutboundText(text:string,limit?:number):ValidationResult<string>{
 if(limit===undefined||!Number.isSafeInteger(limit)||limit<1)return {ok:false,issues:[{code:'capability_limit_unknown',path:'text',message:'未核验发送字节限制'}]};
 return byteLength(text)<=limit?{ok:true,value:text}:{ok:false,issues:[{code:'outbound_utf8_limit',path:'text',message:'发送文本超过已核验UTF-8字节限制'}]};
}
// Only explicit import code may call this alias migration. Normal schemas reject the alias.
export function migrateImportedBinding(input:unknown):ValidationResult<RunBinding>{
 if(!input||typeof input!=='object')return validate(bindingSchema,input);
 const data={...input} as Record<string,unknown>;
 if('credentialBindingId' in data){
  if('authBindingId' in data&&data.authBindingId!==data.credentialBindingId)return {ok:false,issues:[{code:'binding_alias_conflict',path:'authBindingId',message:'导入绑定别名冲突'}]};
  data.authBindingId=data.credentialBindingId;delete data.credentialBindingId;
 }
 return validate(bindingSchema,data);
}
