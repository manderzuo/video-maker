import {openStudioDb,transact,requestResult} from '../../src/infrastructure/storage/database';
import {ProjectSaveSession,readProject,saveProject} from '../../src/infrastructure/storage/project-repository';
import {readRun} from '../../src/infrastructure/storage/run-repository';
import {f} from '../helpers/fixtures';
const db=await openStudioDb();
let session=new ProjectSaveSession(f.project({title:'中文测试项目'})),currentRevision=0;
let fault:'quota'|'abort'|null=null;
const events:string[]=[];
const originalTransaction=IDBDatabase.prototype.transaction;
IDBDatabase.prototype.transaction=function(...args){
 const tx=originalTransaction.apply(this,args);
 const names=typeof args[0]==='string'?[args[0]]:Array.from(args[0]);
 if(args[1]==='readwrite'&&names.includes('projects')){
  // Register at transaction creation, before production promise handlers.
  tx.addEventListener('complete',()=>events.push('transaction-complete'));
  tx.addEventListener('abort',()=>events.push('transaction-abort'));
 }
 return tx;
};
const originalPut=IDBObjectStore.prototype.put;
IDBObjectStore.prototype.put=function(value:unknown,key?:IDBValidKey){
 if(this.name==='projects'&&fault==='quota'){fault=null;throw new DOMException('Injected quota failure at native put','QuotaExceededError');}
 const r=originalPut.call(this,value,key);
 if(this.name==='projects'){
  const abort=fault==='abort';fault=null;
  r.addEventListener('success',()=>{events.push('request-success');if(abort)this.transaction.abort();});
 }
 return r;
};
const field=document.querySelector<HTMLInputElement>('#draft-title')!;
const status=document.querySelector<HTMLElement>('#status')!;
function render(){document.querySelector('#revision')!.textContent=String(currentRevision);document.querySelector<HTMLButtonElement>('#admission')!.disabled=!session.canSubmit();document.querySelector('#events')!.textContent=events.join('\n');}
async function restore(){const saved=await readProject('p1',db);currentRevision=saved?.revision??0;session=new ProjectSaveSession(saved?{...saved,revision:currentRevision+1}:f.project({title:'中文测试项目'}));field.value=session.draft.title;status.textContent=saved?'已恢复已保存版本':'尚无已保存版本';render();}
document.querySelector('#save')!.addEventListener('click',async()=>{
 session.draft.title=field.value;session.draft.revision=currentRevision+1;status.textContent='正在事务保存';
 document.querySelector<HTMLButtonElement>('#admission')!.disabled=true;
 const result=await session.save(currentRevision,{db});
 if(result.status==='saved'){currentRevision=result.revision;events.push('reported-saved');status.textContent='已保存';}
 else status.textContent=result.status==='failed'?`保存失败：${result.code}；内存草稿保留`:'版本冲突，未覆盖';
 render();
});
field.addEventListener('input',()=>{session.draft.title=field.value;render();});
document.querySelector('#reload')!.addEventListener('click',()=>void restore());
document.querySelector('#quota')!.addEventListener('click',()=>{fault='quota';status.textContent='已设定下一次 native put 配额故障';});
document.querySelector('#abort')!.addEventListener('click',()=>{fault='abort';status.textContent='已设定请求成功后中止事务';});
document.querySelector('#admission')!.addEventListener('click',()=>{status.textContent=session.canSubmit()?'本地保存门槛满足；不代表收费授权，不发送请求':'保存门槛未满足';});
async function blockedUpgrade(){
 const old=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('aiwork-studio:blocked-browser',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 try{await openStudioDb({name:'aiwork-studio:blocked-browser'});return 'unexpected-open';}catch(error){return error instanceof Error?error.message:'unknown-error';}finally{old.close();}
}
document.querySelector('#blocked')!.addEventListener('click',async()=>{status.textContent=await blockedUpgrade();});
export async function seedScenario(scenario:string){
 if(!['minimal-project','submit-unknown','newer-project-schema','storage-persistence-denied'].includes(scenario))throw new Error('scenario_not_implemented');
 if(scenario==='newer-project-schema')await transact(db,['projects'],'readwrite',tx=>{tx.objectStore('projects').put({...f.project(),schemaVersion:2});});
 else {const result=await saveProject(f.project(),0,{db,runs:scenario==='submit-unknown'?[f.run({executionState:'submit_unknown'})]:[]});if(result.status!=='saved')throw new Error('seed_failed');}
 if(scenario==='storage-persistence-denied')fault='quota';
 if(scenario!=='newer-project-schema')await restore();
}
export const studioFixture={
 readProject:()=>readProject('p1',db),readRun:()=>readRun('r1',db),
 rows:(table:'graphs'|'runs'|'diagnostics'|'references')=>transact(db,[table],'readonly',tx=>requestResult(tx.objectStore(table).getAll())),
 saveSnapshot:()=>saveProject(f.project({revision:2}),1,{db,graph:f.graph({revision:2}),runs:[f.run({executionState:'submit_unknown'})]}),
 injectFault:(value:'abort'|'quota')=>{fault=value;},events:()=>[...events],blockedUpgrade,
};
declare global {interface Window {studioFixture:typeof studioFixture}}
window.studioFixture=studioFixture;
await restore();
