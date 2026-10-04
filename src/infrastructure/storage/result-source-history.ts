import {historyRunSchema} from '../packages/package-model';
import {requestResult} from './database';
import type {ResultSourceRun} from '../../domain/graph-validation';
// Portable history can prove creative provenance, but can never authorize dispatch.
export async function readResultSourceHistory(tx:IDBTransaction,projectId:string):Promise<ResultSourceRun[]>{
 const row=await requestResult<{kind?:string;projectId?:string;data?:{runs?:unknown[]}}|undefined>(tx.objectStore('receipts').get('import-history:'+projectId));
 if(row?.kind!=='readonly-import-history'||row.projectId!==projectId||!Array.isArray(row.data?.runs))return [];
 return row.data.runs.flatMap(raw=>{const run=historyRunSchema.safeParse(raw);if(!run.success||run.data.projectId!==projectId||run.data.readonly!==true)return [];const {id,nodeId,resultAssetId,executionState}=run.data;return [{id,projectId,nodeId,resultAssetId,executionState}];});
}
