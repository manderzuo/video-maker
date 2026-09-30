import {beforeEach,it,expect,vi} from 'vitest';
import {setSessionCredential,withCredential,forgetSessionCredential,clearSessionCredentials,hasSessionCredential} from '../../src/security/credential-session';
import {redact} from '../../src/security/redaction';
import {IDBFactory} from 'fake-indexeddb';
import {openStudioDb,transact,requestResult} from '../../src/infrastructure/storage/database';
import {f} from '../helpers/fixtures';
import {authBindingSchema,createAuthBinding,validateBinding,copyConnectionConfiguration} from '../../src/domain/authorization';
const secret='fake-core-key-测试-credential';
beforeEach(()=>clearSessionCredentials());
it('T09-C01: credentials remain in module memory, never IndexedDB or browser persistence',async()=>{
 const db=await openStudioDb({factory:new IDBFactory(),name:'credential-boundary'});
 const input=f.connection();await transact(db,['connections'],'readwrite',tx=>{tx.objectStore('connections').put(input);});
 setSessionCredential('credential-'+crypto.randomUUID(),secret);
 const records=await transact(db,db.tables.slice(),'readonly',async tx=>Promise.all(db.tables.map(store=>requestResult(tx.objectStore(store).getAll()))));
 expect(JSON.stringify(records)).not.toContain(secret);db.close();
});
it('T09-C02: reloading the credential module does not recover a key',async()=>{
 const binding='refresh-'+crypto.randomUUID();setSessionCredential(binding,secret);expect(hasSessionCredential(binding)).toBe(true);
 vi.resetModules();const reopened=await import('../../src/security/credential-session');
 expect(reopened.hasSessionCredential(binding)).toBe(false);await expect(reopened.withCredential(binding,async key=>key.length)).rejects.toThrow('session_credential_required');
});
it('T09-C03: changing Key requires a new binding and leaves old binding identity intact',async()=>{
 const old='old-'+crypto.randomUUID(),fresh='fresh-'+crypto.randomUUID();
 setSessionCredential(old,secret);expect(()=>setSessionCredential(old,'fake-other-key')).toThrow('credential_binding_rebind_required');
 forgetSessionCredential(old);expect(()=>setSessionCredential(old,'fake-other-key')).toThrow('credential_binding_rebind_required');
 setSessionCredential(fresh,'fake-other-key');expect(await withCredential(fresh,async value=>value)).toBe('fake-other-key');expect(hasSessionCredential(old)).toBe(false);
});
it('T09-C04: diagnostics use a field whitelist, known-secret scrub and signed-link removal',()=>{
 setSessionCredential('redact-'+crypto.randomUUID(),secret);
 const output=JSON.stringify(redact({id:'run-1',authorization:'Bearer '+secret,message:'错误 '+secret,rawResponse:{key:secret},url:'https://host.invalid/file?token='+secret,executionState:'submit_unknown',deliveryState:'download_failed'}));
 expect(output).not.toContain(secret);expect(output).not.toContain('rawResponse');expect(output).not.toContain('?token');expect(output).toContain('submit_unknown');expect(output).toContain('download_failed');
});
it('T09-C05: secrets are not accepted from credential-bearing URL or header injection',()=>{
 expect(()=>setSessionCredential('bad','https://host.invalid/?api_key=secret')).toThrow('credential_input_invalid');
 expect(()=>setSessionCredential('bad','fake\r\nAuthorization: exploit')).toThrow('credential_input_invalid');
});
it('withCredential errors cannot leak a registered secret, including after forget',async()=>{
 const binding='failure-'+crypto.randomUUID();setSessionCredential(binding,secret);
 await expect(withCredential(binding,async()=>{throw new Error('core said '+secret);})).rejects.toThrow('core said [已脱敏]');
 forgetSessionCredential(binding);expect(JSON.stringify(redact({message:secret}))).not.toContain(secret);
});
it('redaction handles cycles and unrecognized fields without evaluating them',()=>{
 const input:{id:string;recursive?:unknown;secret?:string}={id:'safe',secret};input.recursive=input;
 expect(JSON.stringify(redact(input))).not.toContain(secret);expect(redact(input)).toEqual({id:'safe'});
});
it('diagnostics redact signed URLs embedded inside an error message, not just URL fields',()=>{
 const diagnostic=JSON.stringify(redact({message:'下载错误 https://host.invalid/content?X-Amz-Signature=unregistered-signed-secret&Expires=123'}));
 expect(diagnostic).not.toContain('unregistered-signed-secret');expect(diagnostic).not.toContain('Expires=123');
});
it('ordinary-user binding and config copy cannot grant bridge/admin access or rebind an old run',()=>{
 const connection=f.connection(),binding=createAuthBinding(connection),run=f.run({authBindingId:binding.id});
 expect(validateBinding(run,binding).ok).toBe(true);expect(validateBinding(run,createAuthBinding(connection)).ok).toBe(false);
 expect(authBindingSchema.safeParse({...binding,kind:'bridge'}).success).toBe(false);expect(authBindingSchema.safeParse({...binding,kind:'admin'}).success).toBe(false);
 expect(copyConnectionConfiguration(connection)).toEqual(connection);expect(run.authBindingId).toBe(binding.id);
});
