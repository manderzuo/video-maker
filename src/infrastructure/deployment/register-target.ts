import {connectionSchema} from '../../domain/connection';
import {sanitizeKnownSecrets} from '../../security/credential-session';
export async function registerConnectionTarget(kind:'core'|'text',name:string,origin:string){
 if(sanitizeKnownSecrets(name)!==name||sanitizeKnownSecrets(origin)!==origin)throw Error('connection_metadata_unsafe');
 const options={credentials:'omit' as const,redirect:'error' as const,referrerPolicy:'no-referrer' as const,cache:'no-store' as const,signal:AbortSignal.timeout(5000)};
 const session=await fetch('/studio-session.json',{...options,headers:{'X-Studio-Settings':'1'}});
 if(!session.ok)throw Error('local_settings_service_required');
 const data:unknown=await session.json();if(!data||typeof data!=='object'||!('nonce' in data)||typeof data.nonce!=='string'||!/^[a-f0-9]{64}$/.test(data.nonce))throw Error('settings_session_invalid');
 const response=await fetch('/studio-api/connections',{...options,method:'POST',headers:{'Content-Type':'application/json','X-Studio-Session':data.nonce},body:JSON.stringify({kind,name,origin})});
 if(!response.ok)throw Object.assign(Error('connection_registration_failed'),{httpStatus:response.status});
 const value:unknown=await response.json();if(!value||typeof value!=='object'||!('profile' in value))throw Error('connection_registration_invalid');
 return connectionSchema.parse(value.profile);
}
