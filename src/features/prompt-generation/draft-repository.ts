import {promptDraftSchema,type PromptDraft} from '../../domain/prompt';
import type {SaveResult} from '../../domain/common';
import {transact,requestResult,withDatabase,storageErrorCode,type StudioDb} from '../../infrastructure/storage/database';
export type DraftVersionReceipt={id:string;kind:'prompt-draft-version';draftId:string;revision:number;draft:PromptDraft};
export async function saveDraft(draft:PromptDraft,expectedRevision:number,options:{db?:StudioDb}={}):Promise<SaveResult>{
 const parsed=promptDraftSchema.safeParse(draft);if(!parsed.success)return {status:'failed',code:'prompt_draft_invalid'};
 const input=parsed.data;if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0||input.revision!==expectedRevision)return {status:'failed',code:'prompt_input_revision_mismatch'};
 try{return await withDatabase(options.db,db=>transact(db,['promptDrafts','receipts'],'readwrite',async tx=>{
  const raw:unknown=await requestResult(tx.objectStore('promptDrafts').get(input.id));const previous=raw===undefined?undefined:promptDraftSchema.parse(raw);
  if((previous?.revision??0)!==expectedRevision)return {status:'conflict',currentRevision:previous?.revision??0};
  if(previous&&previous.type!==input.type)throw new Error('prompt_draft_type_frozen');
  if(!previous&&input.resultVersions.length)throw new Error('prompt_results_require_append');
  // Result appends do not advance input revision. Always retain the transaction's latest history.
  const saved=promptDraftSchema.parse({...input,revision:expectedRevision+1,resultVersions:previous?.resultVersions??[]});
  tx.objectStore('promptDrafts').put(saved);
  tx.objectStore('receipts').put({id:`prompt-draft:${saved.id}:${saved.revision}`,kind:'prompt-draft-version',draftId:saved.id,revision:saved.revision,draft:saved} satisfies DraftVersionReceipt);
  return {status:'saved',revision:saved.revision};
 }));}catch(error){return {status:'failed',code:storageErrorCode(error)};}
}
export async function readDraft(id:string,db?:StudioDb):Promise<PromptDraft|undefined>{return withDatabase(db,c=>transact(c,['promptDrafts'],'readonly',async tx=>{const raw:unknown=await requestResult(tx.objectStore('promptDrafts').get(id));return raw===undefined?undefined:promptDraftSchema.parse(raw);}));}
export async function listDrafts(db?:StudioDb):Promise<PromptDraft[]>{return withDatabase(db,c=>transact(c,['promptDrafts'],'readonly',async tx=>(await requestResult<unknown[]>(tx.objectStore('promptDrafts').getAll())).map(row=>promptDraftSchema.parse(row))));}
export async function readDraftRevision(id:string,revision:number,db?:StudioDb):Promise<PromptDraft|undefined>{return withDatabase(db,c=>transact(c,['promptDrafts','receipts'],'readonly',async tx=>{const record:DraftVersionReceipt|undefined=await requestResult(tx.objectStore('receipts').get(`prompt-draft:${id}:${revision}`));if(!record||record.kind!=='prompt-draft-version')return undefined;const current:unknown=await requestResult(tx.objectStore('promptDrafts').get(id));const history=current===undefined?[]:promptDraftSchema.parse(current).resultVersions.filter(v=>v.sourceRevision<=revision);return promptDraftSchema.parse({...record.draft,resultVersions:history});}));}
