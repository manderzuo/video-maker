import {promptDraftSchema,promptResultVersionSchema,promptRunSchema,type PromptResultVersion,type PromptDraft} from '../../domain/prompt';
import {transact,requestResult,withDatabase,type StudioDb} from '../../infrastructure/storage/database';
async function insertResult(tx:IDBTransaction,draft:PromptDraft,sourceRevision:number,result:PromptResultVersion){
 if(result.sourceRevision!==sourceRevision||sourceRevision<1||sourceRevision>draft.revision)throw new Error('prompt_result_revision_invalid');
 const previous=draft.resultVersions.find(v=>v.id===result.id);if(previous){if(JSON.stringify(previous)!==JSON.stringify(result))throw new Error('prompt_result_immutable');return;}
 if(result.origin==='ai'){
  if(!result.promptRunId)throw new Error('prompt_result_run_required');
  const raw:unknown=await requestResult(tx.objectStore('promptRuns').get(result.promptRunId));const run=raw===undefined?undefined:promptRunSchema.parse(raw);
  if(!run||run.draftId!==draft.id||run.draftRevision!==sourceRevision||run.executionState!=='succeeded')throw new Error('prompt_result_run_mismatch');
 }else if(result.promptRunId)throw new Error('prompt_result_run_mismatch');
 if(!await requestResult(tx.objectStore('receipts').get(`prompt-draft:${draft.id}:${sourceRevision}`)))throw new Error('prompt_result_revision_invalid');
 tx.objectStore('promptDrafts').put({...draft,resultVersions:[...draft.resultVersions,result]});
 tx.objectStore('receipts').put({id:`prompt-result:${draft.id}:${result.id}`,kind:'prompt-result-version',draftId:draft.id,sourceRevision,result});
}
export async function appendPromptResult(draftId:string,sourceRevision:number,raw:PromptResultVersion,options:{db?:StudioDb}={}):Promise<void>{
 const result=promptResultVersionSchema.parse(raw);
 await withDatabase(options.db,db=>transact(db,['promptDrafts','promptRuns','receipts'],'readwrite',async tx=>{const raw:unknown=await requestResult(tx.objectStore('promptDrafts').get(draftId));if(raw===undefined)throw new Error('prompt_draft_missing');await insertResult(tx,promptDraftSchema.parse(raw),sourceRevision,result);}));
}
export async function restorePromptResult(draftId:string,resultId:string,expectedRevision:number,options:{db?:StudioDb}={}):Promise<PromptResultVersion>{return withDatabase(options.db,db=>transact(db,['promptDrafts','promptRuns','receipts'],'readwrite',async tx=>{
 const raw:unknown=await requestResult(tx.objectStore('promptDrafts').get(draftId));if(raw===undefined)throw new Error('prompt_draft_missing');const draft=promptDraftSchema.parse(raw);
 if(draft.revision!==expectedRevision)throw new Error('prompt_draft_revision_conflict');const source=draft.resultVersions.find(v=>v.id===resultId);if(!source)throw new Error('prompt_result_missing');
 const {promptRunId:oldRun,...copy}=source;void oldRun;
 const restored=promptResultVersionSchema.parse({...copy,id:crypto.randomUUID(),sourceRevision:draft.revision,origin:'manual',validationState:'unchecked',createdAt:Date.now()});
 await insertResult(tx,draft,draft.revision,restored);tx.objectStore('receipts').put({id:`prompt-restore:${restored.id}`,kind:'prompt-result-restored',draftId,sourceResultId:source.id,resultId:restored.id});return restored;
}));}
