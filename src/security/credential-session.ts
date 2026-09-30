const credentials=new Map<string,string>();
const bindingIdentity=new Map<string,string>();
const knownSecrets=new Set<string>();
export function sanitizeKnownSecrets(input:string):string{
 let result=input;
 for(const secret of Array.from(knownSecrets).sort((a,b)=>b.length-a.length))result=result.split(secret).join('[已脱敏]');
 return result.replace(/Bearer\s+[^\s,;"']+/gi,'Bearer [已脱敏]').replace(/(?:api[_-]?key|token|secret|password)\s*[=:]\s*[^\s,;"']+/gi,'[已脱敏]');
}
export function setSessionCredential(bindingId:string,secret:string):void{
 if(typeof bindingId!=='string'||!bindingId.trim()||typeof secret!=='string'||!secret.trim()||/[\r\n]/.test(secret)||/^https?:\/\//i.test(secret))throw new Error('credential_input_invalid');
 const previous=bindingIdentity.get(bindingId);
 if(previous&&previous!==secret)throw new Error('credential_binding_rebind_required');
 bindingIdentity.set(bindingId,secret);knownSecrets.add(secret);credentials.set(bindingId,secret);
}
export async function withCredential<T>(bindingId:string,action:(secret:string)=>Promise<T>):Promise<T>{
 const secret=credentials.get(bindingId);if(!secret)throw new Error('session_credential_required');
 try{return await action(secret);}catch(error){throw new Error(sanitizeKnownSecrets(error instanceof Error?error.message:'credential_action_failed'));}
}
export function forgetSessionCredential(bindingId:string):void{credentials.delete(bindingId);}
export function clearSessionCredentials():void{credentials.clear();}
export function hasSessionCredential(bindingId:string):boolean{return credentials.has(bindingId);}
