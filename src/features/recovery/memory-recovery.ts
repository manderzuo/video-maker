import {useSyncExternalStore} from 'react';
import type {Project} from '../../domain/project';
import {assetSchema} from '../../domain/asset';
import type {Graph} from '../../domain/graph';
import type {RecoveryIssue} from './recovery-model';
import {withDatabase,transact,requestResult,type StudioDb} from '../../infrastructure/storage/database';
import {portableContent,historyRunSchema,packageAssetIds} from '../../infrastructure/packages/package-model';
import {inspectImport,commitImport,exportMemoryDraft} from '../../infrastructure/packages/import-project';
import {triggerLocalDownload} from '../../ui/local-download';
export type MemoryRecovery={issue:RecoveryIssue;project:Project;graph:Graph};
let records:MemoryRecovery[]=[];const listeners=new Set<()=>void>();const emit=()=>{for(const listener of listeners)listener();};
export const readMemoryRecoveries=()=>records;
export const useMemoryRecoveries=()=>useSyncExternalStore(listener=>{listeners.add(listener);return()=>{listeners.delete(listener);};},readMemoryRecoveries);
export function retainMemoryRecovery(record:MemoryRecovery){records=[...records.filter(r=>r.project.id!==record.project.id),structuredClone(record)];emit();}
export function discardMemoryRecovery(projectId:string){records=records.filter(r=>r.project.id!==projectId);emit();}
export function downloadMemoryRecovery(record:MemoryRecovery){const blob=exportMemoryDraft(record.project,record.graph);triggerLocalDownload(blob,record.project.title+'-未保存内存稿.json');return blob;}
export async function saveConflictCopy(record:MemoryRecovery,db?:StudioDb){const snapshot=structuredClone(record),resources=await withDatabase(db,c=>transact(c,['assets','runs'],'readonly',async tx=>({assets:await requestResult<unknown[]>(tx.objectStore('assets').getAll()),runs:await requestResult<Record<string,unknown>[]>(tx.objectStore('runs').getAll())}))),runs=resources.runs.filter(r=>r.projectId===snapshot.project.id).map(({idempotencyKey,finalBody,finalBodyHash,...run})=>{void idempotencyKey;void finalBody;void finalBodyHash;return historyRunSchema.parse(run);}),data={manifest:{format:'aiwork-studio-project',schemaVersion:1,mode:'structure',createdAt:Date.now(),assets:resources.assets.map(a=>assetSchema.parse(a)).filter(a=>packageAssetIds({graph:snapshot.graph,runs,drafts:[]}).has(a.id))},project:{...snapshot.project,title:[...snapshot.project.title].slice(0,54).join('')+' 冲突副本',archived:false,trashedAt:null},graph:snapshot.graph,runs,drafts:[]},inspection=await inspectImport(new Blob([JSON.stringify(portableContent(data))],{type:'application/json'}));if(!inspection.ok||!inspection.plan)throw Error('conflict_copy_invalid');return commitImport(inspection.plan,{db});}
