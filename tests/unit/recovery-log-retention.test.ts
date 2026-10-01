import {it,expect} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {f} from '../helpers/fixtures';
import {openStudioDb,transact,requestResult} from '../../src/infrastructure/storage/database';
import {clearDiagnosticDisplay} from '../../src/security/diagnostic-export';
it('T38 active/unknown submission diagnostic evidence remains even when unrelated display events are cleared',async()=>{const db=await openStudioDb({factory:new IDBFactory(),name:'active-log-retention'});try{await transact(db,['runs','diagnostics'],'readwrite',tx=>{tx.objectStore('runs').put(f.run({executionState:'submit_unknown'}));tx.objectStore('diagnostics').put({id:'critical',runId:'r1',kind:'dispatch_intent_committed'});tx.objectStore('diagnostics').put({id:'display',kind:'project_saved'});});expect(await clearDiagnosticDisplay(db)).toBe(1);expect(await transact(db,['diagnostics'],'readonly',tx=>requestResult(tx.objectStore('diagnostics').get('critical')))).toBeDefined();}finally{db.close();}});
