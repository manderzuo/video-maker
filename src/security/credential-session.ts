const credentials=new Map<string,string>();
const bindingIdentity=new Map<string,string>();
const knownSecrets=new Set<string>();
const revisions=new Map<string,number>();
const listeners=new Set<()=>void>();
function changed(bindingId:string){revisions.set(bindingId,(revisions.get(bindingId)??0)+1);for(const listener of listeners)listener();}
export function credentialRevision(bindingId:string){return revisions.get(bindingId)??0;}
export function subscribeSessionCredentials(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}
export function registerDiagnosticSecret(secret:string){if(secret)knownSecrets.add(secret);}
export function sanitizeKnownSecrets(input:string):string{
 let result=input;
 for(const secret of Array.from(knownSecrets).sort((a,b)=>b.length-a.length))result=result.split(secret).join('[已脱敏]');
 return result.replace(/Bearer\s+[^\s,;"']+/gi,'Bearer [已脱敏]').replace(/(?:api[_-]?key|token|secret|password)\s*[=:]\s*[^\s,;"']+/gi,'[已脱敏]');
}
export function setSessionCredential(bindingId:string,secret:string):void{
 if(typeof bindingId!=='string'||!bindingId.trim()||typeof secret!=='string'||!secret.trim()||/[\r\n]/.test(secret)||/^https?:\/\//i.test(secret))throw new Error('credential_input_invalid');
 const previous=bindingIdentity.get(bindingId);
 if(previous&&previous!==secret)throw new Error('credential_binding_rebind_required');
 bindingIdentity.set(bindingId,secret);knownSecrets.add(secret);if(!credentials.has(bindingId)){credentials.set(bindingId,secret);changed(bindingId);}
}
export async function withCredential<T>(bindingId:string,action:(secret:string)=>Promise<T>):Promise<T>{
 const secret=credentials.get(bindingId);if(!secret)throw new Error('session_credential_required');
 try{return await action(secret);}catch(error){throw new Error(sanitizeKnownSecrets(error instanceof Error?error.message:'credential_action_failed'));}
}
export function forgetSessionCredential(bindingId:string):void{if(credentials.delete(bindingId))changed(bindingId);}
export function clearSessionCredentials():void{for(const id of [...credentials.keys()])forgetSessionCredential(id);}
export function hasSessionCredential(bindingId:string):boolean{return credentials.has(bindingId);}
