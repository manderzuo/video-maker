import {expect,it} from 'vitest';
import {ApiSecrets} from '../src/security/api-secrets.js';
const identity={userId:'fake-user-a',configId:'fake-config-a',secretVersion:1};
const keys=new Map([['old',Buffer.alloc(32,1)],['new',Buffer.alloc(32,2)]]);
it('round trips with random nonces, records root version, and binds exact ownership/config/version',()=>{
 const box=new ApiSecrets({activeVersion:'new',keys});const key='FAKE_SEALED_KEY';const sealed=box.seal(identity,key),second=box.seal(identity,key);
 expect(sealed.keyVersion).toBe('new');expect(sealed.nonce.equals(second.nonce)).toBe(false);expect(box.open(identity,sealed)).toBe(key);expect(sealed.ciphertext.toString()).not.toContain(key);
 for(const wrong of [{...identity,userId:'fake-user-b'},{...identity,configId:'fake-config-b'},{...identity,secretVersion:2}])expect(()=>box.open(wrong,sealed)).toThrow('SECRET_UNAVAILABLE');
 const changed={...sealed,ciphertext:Buffer.from(sealed.ciphertext)};changed.ciphertext[0]^=1;expect(()=>box.open(identity,changed)).toThrow('SECRET_UNAVAILABLE');
});
it('decrypts referenced old root versions and fails closed when a root version is missing',()=>{
 const old=new ApiSecrets({activeVersion:'old',keys});const sealed=old.seal(identity,'FAKE_OLD_KEY');const current=new ApiSecrets({activeVersion:'new',keys});expect(current.open(identity,sealed)).toBe('FAKE_OLD_KEY');
 const missing=new ApiSecrets({activeVersion:'new',keys:new Map([['new',Buffer.alloc(32,2)]])});expect(()=>missing.open(identity,sealed)).toThrow('SECRET_UNAVAILABLE');
});
it('requires explicitly provided 32-byte versioned roots and rejects malformed encrypted envelopes',()=>{
 expect(()=>new ApiSecrets({activeVersion:'bad',keys:new Map([['bad',Buffer.alloc(31)]])})).toThrow();
 const box=new ApiSecrets({activeVersion:'new',keys});const sealed=box.seal(identity,'FAKE_KEY');expect(()=>box.open(identity,{...sealed,nonce:Buffer.alloc(1)})).toThrow('SECRET_UNAVAILABLE');
});
