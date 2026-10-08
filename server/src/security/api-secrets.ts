import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {HttpError} from '../errors.js';
export type SecretIdentity={userId:string;configId:string;secretVersion:number};
export type SealedSecret={keyVersion:string;nonce:Buffer;ciphertext:Buffer;tag:Buffer};
export class ApiSecrets {
 private readonly keys:Map<string,Buffer>;
 constructor(private readonly options:{activeVersion:string;keys:ReadonlyMap<string,Buffer>}){
  this.keys=new Map([...options.keys].map(([version,key])=>[version,Buffer.from(key)]));
  if(!/^[A-Za-z0-9_.-]{1,64}$/.test(options.activeVersion)||!this.keys.has(options.activeVersion)||[...this.keys.values()].some(k=>k.length!==32))throw new Error('Explicit versioned 32-byte encryption roots required');
 }
 private aad(identity:SecretIdentity,keyVersion:string){return Buffer.from(JSON.stringify([identity.userId,identity.configId,identity.secretVersion,keyVersion]));}
 seal(identity:SecretIdentity,key:string):SealedSecret{
  const keyVersion=this.options.activeVersion,nonce=randomBytes(12);
  const cipher=createCipheriv('aes-256-gcm',this.keys.get(keyVersion)!,nonce);cipher.setAAD(this.aad(identity,keyVersion));
  return {keyVersion,nonce,ciphertext:Buffer.concat([cipher.update(key,'utf8'),cipher.final()]),tag:cipher.getAuthTag()};
 }
 open(identity:SecretIdentity,sealed:SealedSecret):string{
  try{
   const root=this.keys.get(sealed.keyVersion);if(!root||sealed.nonce.length!==12||sealed.tag.length!==16)throw new Error('Invalid envelope');
   const decipher=createDecipheriv('aes-256-gcm',root,sealed.nonce);decipher.setAAD(this.aad(identity,sealed.keyVersion));decipher.setAuthTag(sealed.tag);
   return Buffer.concat([decipher.update(sealed.ciphertext),decipher.final()]).toString('utf8');
  }catch{throw new HttpError(500,'SECRET_UNAVAILABLE');}
 }
}
