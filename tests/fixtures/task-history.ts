import {f} from '../helpers/fixtures';
import {openStudioDb,transact,requestResult} from '../../src/infrastructure/storage/database';
import {createCoreClient} from '../../src/adapters/core/http-client';
import {setSessionCredential,withCredential} from '../../src/security/credential-session';
import {setActiveCore} from '../../src/adapters/core/current-connection';
import {studioTabId} from '../../src/features/projects/project-service';
import {generationCaps} from './generation';
export function connectTaskHistory(){const profile=f.connection(),binding={id:'task-original-binding',connectionId:profile.id,originSnapshot:profile.originSnapshot,kind:'core-user' as const,createdAt:1000};setSessionCredential(binding.id,'fake-task-key');const client=createCoreClient(profile,{binding,withCredential},{registry:[profile]});setActiveCore(client,generationCaps);}
export async function seedTaskHistory(){const db=await openStudioDb();try{await transact(db,db.tables.slice(),'readwrite',tx=>{
 for(const table of db.tables)tx.objectStore(table).clear();tx.objectStore('projects').put(f.project());tx.objectStore('projects').put(f.project({id:'p2',title:'归档项目',archived:true}));
 tx.objectStore('graphs').put(f.graph({nodes:[{id:'text-1',type:'text',title:'=HYPERLINK("https://invalid.example")',x:20,y:20,locked:false,data:{kind:'text',text:'原创正文',referenceTokens:[]}}]}));
 const base={authBindingId:'task-original-binding',nodeId:'text-1',taskId:'mock-core-1',coreRequestId:'core-original-1'};
 for(const run of [f.run({...base,id:'video-run-1',executionState:'running',queryState:'interrupted'}),f.run({...base,id:'video-run-foreign',projectId:'p2',connectionId:'foreign-core',authBindingId:'foreign-binding',originSnapshot:'https://foreign.invalid',taskId:'foreign-task',executionState:'running',queryState:'interrupted'}),f.run({...base,id:'video-run-unknown',nodeId:'deleted-node',executionState:'submit_unknown',taskId:undefined}),f.run({...base,id:'video-run-completed',nodeId:'deleted-node',executionState:'succeeded',deliveryState:'cached_local'})]){tx.objectStore('runs').put(run);tx.objectStore('leases').put({id:'dispatch:'+run.id,projectId:run.projectId,runId:run.id,tabId:studioTabId,epoch:1,revision:1,expiresAt:0,dispatchCommitted:true});}
 tx.objectStore('promptDrafts').put(f.draft({sourceProjectId:'p1',sourceNodeId:'text-1'}));tx.objectStore('promptRuns').put({id:'prompt-run-1',draftId:'d1',draftRevision:1,mode:'ai',textModelId:'fake-text-only',connectionId:'c1',authBindingId:'task-original-binding',originSnapshot:'https://core.invalid',idempotencyKey:'studio-text-fixture',requestSnapshot:JSON.stringify({model:'fake-text-only',messages:[{role:'user',content:'fake-task-key 创意'}]}),executionState:'response_unknown',billingState:'not_provided',startedAt:1000});
 });}finally{db.close();}}
export async function taskHistoryState(){const db=await openStudioDb();try{return await transact(db,['runs','promptRuns','receipts'],'readonly',async tx=>({runs:await requestResult(tx.objectStore('runs').getAll()),promptRuns:await requestResult(tx.objectStore('promptRuns').getAll()),receipts:await requestResult(tx.objectStore('receipts').getAll())}));}finally{db.close();}}
