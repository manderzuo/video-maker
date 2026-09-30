import {promptRunSchema,promptDraftSchema,type PromptRun} from '../../domain/prompt';
import {transact,requestResult,withDatabase,type StudioDb} from '../../infrastructure/storage/database';
const transitions:Record<PromptRun['executionState'],PromptRun['executionState'][]>={persisted:['sending','failed_confirmed'],sending:['succeeded','failed_confirmed','response_unknown','waiting_stopped'],response_unknown:['succeeded','failed_confirmed','waiting_stopped'],waiting_stopped:['succeeded','failed_confirmed','response_unknown'],succeeded:[],failed_confirmed:[]};
export async function savePromptRun(raw:PromptRun,options:{db?:StudioDb;expectedState?:PromptRun['executionState']}={}):Promise<void>{
 await withDatabase(options.db,db=>transact(db,['promptDrafts','promptRuns','receipts'],'readwrite',tx=>putPromptRunInTransaction(tx,raw,options.expectedState)));
}
export async function putPromptRunInTransaction(tx:IDBTransaction,raw:PromptRun,expected?:PromptRun['executionState']):Promise<void>{
 const run=promptRunSchema.parse(raw);
  const prior:unknown=await requestResult(tx.objectStore('promptRuns').get(run.id));const previous=prior===undefined?undefined:promptRunSchema.parse(prior);
  if(previous){
   if(expected!==previous.executionState)throw new Error('prompt_run_state_conflict');
   for(const field of ['draftId','draftRevision','mode','connectionId','authBindingId','originSnapshot','textModelId','idempotencyKey','requestSnapshot','startedAt'] as const)if(previous[field]!==run[field])throw new Error('prompt_run_identity_frozen');
   if(previous.coreRequestId&&run.coreRequestId!==previous.coreRequestId)throw new Error('prompt_run_identity_frozen');
   if(previous.finishedAt!==undefined&&run.finishedAt!==previous.finishedAt)throw new Error('prompt_run_identity_frozen');
   if(run.executionState!==previous.executionState&&!transitions[previous.executionState].includes(run.executionState))throw new Error('prompt_run_transition_invalid');
  }else{
   if(expected!==undefined||run.executionState!=='persisted')throw new Error('prompt_run_initial_state_invalid');
   const draftRaw:unknown=await requestResult(tx.objectStore('promptDrafts').get(run.draftId));if(draftRaw===undefined)throw new Error('prompt_draft_missing');const draft=promptDraftSchema.parse(draftRaw);
   if(draft.type!=='video')throw new Error('image_prompt_generation_unavailable');
   if(draft.revision!==run.draftRevision)throw new Error('prompt_draft_revision_conflict');
   const existing=await requestResult<PromptRun[]>(tx.objectStore('promptRuns').getAll());if(existing.some(r=>r.connectionId===run.connectionId&&r.authBindingId===run.authBindingId&&r.idempotencyKey===run.idempotencyKey))throw new Error('prompt_run_idempotency_duplicate');
  }
  tx.objectStore('promptRuns').put(run);tx.objectStore('receipts').put({id:crypto.randomUUID(),kind:'prompt-run-state',promptRunId:run.id,draftId:run.draftId,executionState:run.executionState,at:Date.now()});
}
export async function readPromptRun(id:string,db?:StudioDb):Promise<PromptRun|undefined>{return withDatabase(db,c=>transact(c,['promptRuns'],'readonly',async tx=>{const raw:unknown=await requestResult(tx.objectStore('promptRuns').get(id));return raw===undefined?undefined:promptRunSchema.parse(raw);}));}
