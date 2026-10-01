import {withDatabase,transact,requestResult,type StudioDb} from '../../infrastructure/storage/database';import {assertProjectWriter,type ProjectLeaseToken} from '../../infrastructure/storage/project-lease';
import {loadResourceSnapshot,referencesFor,type ResourceSnapshot} from '../assets/reference-index';import {deletionTables,removeProjectRecordsInTransaction,removeUnreferencedAssetsInTransaction} from '../projects/delete-policy';import {promptRunSchema,type PromptRun} from '../../domain/prompt';import {fingerprintText} from '../../application/runs/fingerprint';import {z} from 'zod';
export type LocalCleanupKind='unreferenced-assets'|'projects';
export type LocalCleanupImpact={kind:LocalCleanupKind;impactHash:string;items:{id:string;title:string}[];protectedAssets:number;blockers:string[];deletable:boolean};
const tables=[...deletionTables,'promptRuns'] as const;
type Capture={snapshot:ResourceSnapshot;promptRuns:PromptRun[];fingerprint:string};
const cleanupImpactSchema=z.strictObject({kind:z.enum(['unreferenced-assets','projects']),impactHash:z.string().regex(/^[a-f0-9]{64}$/),items:z.array(z.strictObject({id:z.string().min(1),title:z.string().min(1)})),protectedAssets:z.number().int().nonnegative(),blockers:z.array(z.string()),deletable:z.boolean()});
async function capture(tx:IDBTransaction):Promise<Capture>{const snapshot=await loadResourceSnapshot(tx),promptRuns=(await requestResult<unknown[]>(tx.objectStore('promptRuns').getAll())).map(row=>promptRunSchema.parse(row));return{snapshot,promptRuns,fingerprint:JSON.stringify({snapshot,promptRuns})};}
function derive(kind:LocalCleanupKind,stored:Capture):Omit<LocalCleanupImpact,'impactHash'>{
 const snapshot=stored.snapshot,unused=snapshot.assets.filter(asset=>referencesFor(snapshot,asset.id).length===0),items=(kind==='projects'?snapshot.projects:unused).map(row=>({id:row.id,title:row.title}));
 const withdrawn=new Set(snapshot.runs.filter(run=>run.executionState==='persisted'&&!run.taskId&&snapshot.receipts.some(row=>!!row&&typeof row==='object'&&'id'in row&&row.id==='run-withdrawal:'+run.id&&'kind'in row&&row.kind==='local-unsent-withdrawal'&&'runId'in row&&row.runId===run.id&&'authBindingId'in row&&row.authBindingId===run.authBindingId&&'connectionId'in row&&row.connectionId===run.connectionId&&'originSnapshot'in row&&row.originSnapshot===run.originSnapshot)).map(run=>run.id));
 const blockers=kind==='projects'?snapshot.runs.filter(run=>(!['succeeded','failed_confirmed'].includes(run.executionState)&&!withdrawn.has(run.id))||run.billingState==='pending_reconciliation').map(run=>'受保护视频追踪 '+run.id).concat(stored.promptRuns.filter(run=>!['succeeded','failed_confirmed'].includes(run.executionState)||run.billingState==='pending_reconciliation').map(run=>'受保护文字追踪 '+run.id)):[];
 return{kind,items,protectedAssets:snapshot.assets.length-unused.length,blockers,deletable:blockers.length===0};
}
export async function inspectLocalCleanup(kind:LocalCleanupKind,db?:StudioDb):Promise<LocalCleanupImpact>{const parsed=z.enum(['unreferenced-assets','projects']).parse(kind);return withDatabase(db,async connection=>{const stored=await transact(connection,[...tables],'readonly',capture);return{...derive(parsed,stored),impactHash:await fingerprintText(stored.fingerprint)};});}
export async function commitLocalCleanup(impact:LocalCleanupImpact,confirmation:{confirmed:true;text?:string},options:{db?:StudioDb;leases?:ProjectLeaseToken[]}={}):Promise<{removed:number}>{
 const intent=structuredClone(impact);cleanupImpactSchema.parse(intent);const decision=z.strictObject({confirmed:z.literal(true),text:z.string().optional()}).parse(confirmation);if(intent.kind==='projects'&&decision.text!=='清空本地项目')throw Error('cleanup_confirmation_required');
 return withDatabase(options.db,async db=>{
  const stored=await transact(db,[...tables],'readonly',capture),actual={...derive(intent.kind,stored),impactHash:await fingerprintText(stored.fingerprint)};
  if(JSON.stringify(actual)!==JSON.stringify(intent))throw Error('cleanup_impact_changed');if(!actual.deletable)throw Error('cleanup_tracking_protected');
  return transact(db,[...tables],'readwrite',async tx=>{
   const current=await capture(tx);if(current.fingerprint!==stored.fingerprint)throw Error('cleanup_impact_changed');
   if(intent.kind==='unreferenced-assets')removeUnreferencedAssetsInTransaction(tx,current.snapshot,intent.items.map(item=>item.id));
   else{
    for(const project of current.snapshot.projects)await assertProjectWriter(tx,project.id,options.leases?.find(lease=>lease.projectId===project.id));
    for(const project of current.snapshot.projects)removeProjectRecordsInTransaction(tx,project.id,current.snapshot);
   }
   tx.objectStore('receipts').put({id:'local-cleanup:'+crypto.randomUUID(),kind:'local-cleanup',scope:intent.kind,removedIds:intent.items.map(item=>item.id),count:intent.items.length,impactHash:intent.impactHash,createdAt:Date.now()});return{removed:intent.items.length};
  });
 });
}
