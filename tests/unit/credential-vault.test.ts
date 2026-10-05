import 'fake-indexeddb/auto';
import {beforeEach,describe,it,expect} from 'vitest';
import {credentialVaultName,saveCredential,readCredential,removeSavedCredential} from '../../src/security/credential-vault';
import {createAuthBinding} from '../../src/domain/authorization';
import {f} from '../helpers/fixtures';
beforeEach(()=>new Promise<void>((resolve,reject)=>{const r=indexedDB.deleteDatabase(credentialVaultName);r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error);}));
function saved(){const profile=f.connection();return {profile,binding:createAuthBinding(profile),capability:f.caps(),secret:'fake-vault-key'};}
describe('local encrypted credential vault',()=>{
 it('round trips the original binding while storing ciphertext and a non-exportable AES key',async()=>{
  const item=saved();await saveCredential('video',item);expect(await readCredential('video')).toEqual(item);
  const db=await new Promise<IDBDatabase>(resolve=>{const r=indexedDB.open(credentialVaultName);r.onsuccess=()=>resolve(r.result);});
  try{const rows=await new Promise<{id:string;key?:CryptoKey;data?:ArrayBuffer}[]>(resolve=>{const r=db.transaction('entries').objectStore('entries').getAll();r.onsuccess=()=>resolve(r.result);});expect(JSON.stringify(rows)).not.toContain(item.secret);expect(new TextDecoder().decode(rows.find(r=>r.id==='video')!.data)).not.toContain(item.secret);expect(rows.find(r=>r.id==='master')!.key!.extractable).toBe(false);await expect(crypto.subtle.exportKey('raw',rows.find(r=>r.id==='master')!.key!)).rejects.toThrow();}finally{db.close();}
 });
 it('clears only the selected channel and does not restore it again',async()=>{await saveCredential('video',saved());await removeSavedCredential('video');expect(await readCredential('video')).toBeUndefined();});
 it('refuses cross-service bindings and obsolete writes',async()=>{const item=saved();await expect(saveCredential('video',{...item,binding:{...item.binding,originSnapshot:'https://other.invalid'}})).rejects.toThrow('credential_snapshot_invalid');expect(await saveCredential('video',item,()=>false)).toBe(false);expect(await readCredential('video')).toBeUndefined();});
 it('rejects tampered authenticated ciphertext without exposing the key',async()=>{await saveCredential('video',saved());const db=await new Promise<IDBDatabase>(resolve=>{const r=indexedDB.open(credentialVaultName);r.onsuccess=()=>resolve(r.result);});try{await new Promise<void>(resolve=>{const tx=db.transaction('entries','readwrite'),s=tx.objectStore('entries'),r=s.get('video');r.onsuccess=()=>{const row=r.result;new Uint8Array(row.data)[0]^=1;s.put(row);};tx.oncomplete=()=>resolve();});}finally{db.close();}await expect(readCredential('video')).rejects.toThrow('credential_restore_failed');});
});
