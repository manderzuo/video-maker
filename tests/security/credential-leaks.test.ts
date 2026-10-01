import {it,expect} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {openStudioDb,transact,requestResult} from '../../src/infrastructure/storage/database';
import {f} from '../helpers/fixtures';
import {setSessionCredential,forgetSessionCredential} from '../../src/security/credential-session';
import {redact} from '../../src/security/redaction';
import {exportProject} from '../../src/infrastructure/packages/export-project';
import {exportDiagnostics} from '../../src/security/diagnostic-export';
it('T45 credential and signed URL exports omit registered fake Key, execution approval and raw paid request while preserving original Chinese content',async()=>{
 const key='fake-t45-export-only-key',db=await openStudioDb({factory:new IDBFactory(),name:'t45-export'});setSessionCredential('t45-export-binding',key);
 try{await transact(db,['projects','graphs','runs','diagnostics','receipts'],'readwrite',tx=>{tx.objectStore('projects').put(f.project());tx.objectStore('graphs').put(f.graph({nodes:[{id:'text',type:'text',title:'原创文字',x:0,y:0,locked:false,data:{kind:'text',text:'品牌汉字康济健葆 '+key,referenceTokens:[]}}]}));tx.objectStore('runs').put(f.run({inputSnapshot:{prompt:'private '+key},finalBody:JSON.stringify({prompt:'private '+key})}));tx.objectStore('diagnostics').put({id:'t45-failure',kind:'storage_failed',at:1,message:'Bearer '+key+' https://example.invalid/file?token=temporary-secret',errorCode:'storage_failed'});tx.objectStore('receipts').put({id:'approval:t45-private',kind:'video',authorization:key});});
 const project=await exportProject('p1',{mode:'structure',db}),diagnostics=await exportDiagnostics({},db),exports=(await project.blob.text())+'\n'+(await diagnostics.text());expect(exports).not.toContain(key);expect(exports).not.toContain('temporary-secret');expect(exports).not.toContain('approval:t45-private');expect(exports).not.toContain('idempotencyKey');expect(exports).not.toContain('finalBody');expect(exports).toContain('康济健葆');
 const native=await transact(db,['receipts','runs'],'readonly',async tx=>({receipts:await requestResult(tx.objectStore('receipts').getAll()),runs:await requestResult(tx.objectStore('runs').getAll())}));expect(native.receipts[0].authorization).toBe(key);expect(native.runs[0].finalBody).toContain(key);
 }finally{forgetSessionCredential('t45-export-binding');db.close();}
});
it('T45 audited errors and recursive contexts scrub known secrets and signed parameters without including input bodies',()=>{
 const key='fake-t45-diagnostic-context',binding='t45-diagnostic-binding';setSessionCredential(binding,key);try{const value={id:'entry',message:key+' https://example.invalid/result?signature=temporary&t=123',inputSnapshot:{prompt:'private prompt'},rawResponse:{apiKey:key},warnings:[key]};const output=JSON.stringify(redact(value));expect(output).not.toContain(key);expect(output).not.toContain('temporary');expect(output).not.toContain('private prompt');expect(output).not.toContain('rawResponse');expect(output).toContain('[已脱敏]');expect(output).toContain('https://example.invalid/result');}finally{forgetSessionCredential(binding);}
});
