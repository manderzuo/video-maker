import type {ApiSettingsDependencies} from '../settings/service.js';
import {strictJson} from '../../../src/domain/prompt-engine/structured-result.js';
const identity=(userId:string,id:string,secretVersion:number)=>({userId,configId:'prompt-response:'+id,secretVersion});
export function sealResponse(body:Buffer,status:number,userId:string,id:string,secretVersion:number,dependencies:ApiSettingsDependencies,keys:string[]){
 if(body.length>1024*1024)throw Error('UPSTREAM_TOO_LARGE');
 const sealed=dependencies.secrets.seal(identity(userId,id,secretVersion),body.toString('base64'));
 let providerRequestId:string|undefined;
 try{const parsed=strictJson(body.toString('utf8')) as {request_id?:unknown;id?:unknown};const value=parsed?.request_id??parsed?.id;
  if(typeof value==='string'&&/^[-A-Za-z0-9._~]{1,256}$/.test(value)&&!keys.some(key=>value.includes(key)))providerRequestId=value;
 }catch{/* The encrypted original remains available even when its JSON is invalid. */}
 return {kind:'prompt-call-response-v2',responseStatus:status,...(providerRequestId?{providerRequestId}:{}),sealedResponse:{keyVersion:sealed.keyVersion,nonce:sealed.nonce.toString('base64'),ciphertext:sealed.ciphertext.toString('base64'),tag:sealed.tag.toString('base64')}};
}
export function openResponse(snapshot:unknown,userId:string,id:string,secretVersion:number,dependencies:ApiSettingsDependencies):Buffer|undefined{
 if(!snapshot||typeof snapshot!=='object'||!('sealedResponse'in snapshot))return undefined;
 const value=snapshot.sealedResponse as Record<string,unknown>;
 if(!value||['keyVersion','nonce','ciphertext','tag'].some(key=>typeof value[key]!=='string')||String(value.ciphertext).length>2*1024*1024)throw Error('SAVED_RESPONSE_INVALID');
 const raw=dependencies.secrets.open(identity(userId,id,secretVersion),{keyVersion:String(value.keyVersion),nonce:Buffer.from(String(value.nonce),'base64'),ciphertext:Buffer.from(String(value.ciphertext),'base64'),tag:Buffer.from(String(value.tag),'base64')});
 const body=Buffer.from(raw,'base64');if(body.length>1024*1024)throw Error('SAVED_RESPONSE_INVALID');return body;
}
