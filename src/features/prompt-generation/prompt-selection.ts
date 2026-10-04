import {promptDraftSchema} from '../../domain/prompt';
import {requestResult,transact,withDatabase} from '../../infrastructure/storage/database';

type SelectionRecord={id:string;kind:'prompt-result-selection';draftId:string;resultId:string};
const selectionKey=(draftId:string)=>`prompt-result-selection:${draftId}`;

export async function readPromptResultSelection(draftId:string):Promise<string|undefined>{
 return withDatabase(undefined,db=>transact(db,['diagnostics'],'readonly',async tx=>{
  const raw:unknown=await requestResult(tx.objectStore('diagnostics').get(selectionKey(draftId)));
  if(!raw||typeof raw!=='object')return undefined;
  const row=raw as Partial<SelectionRecord>;
  return row.kind==='prompt-result-selection'&&row.draftId===draftId&&typeof row.resultId==='string'?row.resultId:undefined;
 }));
}

export async function savePromptResultSelection(draftId:string,resultId:string):Promise<void>{
 await withDatabase(undefined,db=>transact(db,['promptDrafts','diagnostics'],'readwrite',async tx=>{
  const raw:unknown=await requestResult(tx.objectStore('promptDrafts').get(draftId));
  if(raw===undefined)throw Error('prompt_draft_missing');
  const draft=promptDraftSchema.parse(raw);
  if(!draft.resultVersions.some(version=>version.id===resultId))throw Error('prompt_result_missing');
  tx.objectStore('diagnostics').put({id:selectionKey(draftId),kind:'prompt-result-selection',draftId,resultId} satisfies SelectionRecord);
 }));
}
