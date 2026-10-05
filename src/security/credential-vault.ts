import {z} from 'zod';
import {connectionSchema,capabilitySchema} from '../domain/connection';
import {authBindingSchema} from '../domain/authorization';
export const credentialVaultName='aiwork-studio:credentials:v1';
const payloadSchema=z.strictObject({profile:connectionSchema,binding:authBindingSchema,capability:capabilitySchema,secret:z.string().min(1).max(16384)});
export type SavedCredential=z.infer<typeof payloadSchema>;
type Envelope={id:'text'|'video';version:1;nonce:Uint8Array;data:ArrayBuffer};
async function database(){return new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open(credentialVaultName,1);r.onupgradeneeded=()=>r.result.createObjectStore('entries',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('credential_storage_unavailable'));r.onblocked=()=>reject(Error('credential_storage_blocked'));});}
function request<T>(r:IDBRequest<T>):Promise<T>{return new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('credential_storage_failed'));});}
async function transaction<T>(mode:IDBTransactionMode,work:(store:IDBObjectStore)=>Promise<T>):Promise<T>{const db=await database();try{const tx=db.transaction('entries',mode),done=new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>reject(Error('credential_storage_failed'));});done.catch(()=>{});const result=await work(tx.objectStore('entries'));await done;return result;}finally{db.close();}}
async function masterKey(){const existing=await transaction('readonly',s=>request<{key:CryptoKey}|undefined>(s.get('master')));if(existing)return existing.key;
 const generated=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
 return transaction('readwrite',async s=>{const prior=await request<{key:CryptoKey}|undefined>(s.get('master'));if(prior)return prior.key;await request(s.put({id:'master',key:generated}));return generated;});
}
export async function saveCredential(channel:'text'|'video',input:SavedCredential,stillCurrent:()=>boolean=()=>true){
 const parsed=payloadSchema.safeParse(input);if(!parsed.success||parsed.data.binding.connectionId!==parsed.data.profile.id||parsed.data.binding.originSnapshot!==parsed.data.profile.originSnapshot||parsed.data.binding.kind!==(channel==='text'?'text-api':'core-user')||parsed.data.capability.contractVersion!==parsed.data.profile.contractVersion)throw Error('credential_snapshot_invalid');
 const key=await masterKey(),nonce=crypto.getRandomValues(new Uint8Array(12)),data=await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce,additionalData:new TextEncoder().encode(channel)},key,new TextEncoder().encode(JSON.stringify(parsed.data)));
 if(!stillCurrent())return false;
 await transaction('readwrite',async store=>{if(!stillCurrent())throw Error('credential_snapshot_obsolete');await request(store.put({id:channel,version:1,nonce,data} satisfies Envelope));});return true;
}
export async function readCredential(channel:'text'|'video'):Promise<SavedCredential|undefined>{
 const envelope=await transaction('readonly',s=>request<Envelope|undefined>(s.get(channel)));if(!envelope)return;
 try{const key=await masterKey(),data=await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(envelope.nonce),additionalData:new TextEncoder().encode(channel)},key,envelope.data),parsed=payloadSchema.safeParse(JSON.parse(new TextDecoder().decode(data)));if(!parsed.success)throw Error('invalid');const item=parsed.data;if(item.binding.kind!==(channel==='text'?'text-api':'core-user')||item.binding.connectionId!==item.profile.id||item.binding.originSnapshot!==item.profile.originSnapshot||item.capability.contractVersion!==item.profile.contractVersion)throw Error('invalid');return item;}catch{throw Error('credential_restore_failed');}
}
export async function removeSavedCredential(channel:'text'|'video'){await transaction('readwrite',s=>request(s.delete(channel)));}
