import {projectSchema,type Project} from '../../domain/project';
import {graphSchema,type Graph} from '../../domain/graph';
import {assetSchema,type Asset} from '../../domain/asset';
import {portableMigrationContent,migrationPreferencesSchema,migrationRecordSchema,type WorkspaceMigration} from '../../domain/workspace-migration';
export type LegacySnapshot={version:number;projects:Project[];graphs:Graph[];assets:Asset[];records:WorkspaceMigration['records'];blobs:Map<string,Blob>;preferences:WorkspaceMigration['preferences']};
const receiptKinds=new Set(['agent-local-conversation','agent-local-note','agent-proposal-decision','prompt-draft-version','prompt-result-version','prompt-result-restored','prompt-run-state','asset-metadata']);
const tables=['projects','graphs','assets','blobs','prompts','promptDrafts','runs','promptRuns','proposals','receipts','references'] as const;
function request<T>(value:IDBRequest<T>):Promise<T>{return new Promise((resolve,reject)=>{value.onsuccess=()=>resolve(value.result);value.onerror=()=>reject(new Error('legacy_read_failed'));});}
async function existingDatabase(factory:IDBFactory):Promise<IDBDatabase|undefined>{
 if(factory.databases&&!((await factory.databases()).some(row=>row.name==='aiwork-studio:v1')))return;
 return new Promise((resolve,reject)=>{let absent=false,blocked=false;const opened=factory.open('aiwork-studio:v1');opened.onupgradeneeded=()=>{absent=true;opened.transaction!.abort();};opened.onsuccess=()=>{if(blocked){opened.result.close();return;}opened.result.onversionchange=()=>opened.result.close();resolve(opened.result);};opened.onerror=()=>absent?resolve(undefined):reject(new Error('legacy_read_failed'));opened.onblocked=()=>{blocked=true;reject(new Error('legacy_close_old_tabs'));};});
}
export async function readLegacyWorkspace(options:{factory?:IDBFactory;preferences?:string|null}={}):Promise<LegacySnapshot>{
 const snapshot:LegacySnapshot={version:1,projects:[],graphs:[],assets:[],records:[],blobs:new Map(),preferences:undefined},db=await existingDatabase(options.factory??indexedDB);
 if(options.preferences){let raw:unknown;try{raw=JSON.parse(options.preferences);}catch{throw new Error('legacy_preferences_invalid');}if(raw&&typeof raw==='object'&&!Array.isArray(raw)){const selected=Object.fromEntries(Object.keys(migrationPreferencesSchema.shape).filter(key=>key in raw).map(key=>[key,(raw as Record<string,unknown>)[key]]));snapshot.preferences=migrationPreferencesSchema.parse(selected);}}
 if(!db)return snapshot;
 try{
  snapshot.version=db.version;const available=tables.filter(table=>db.objectStoreNames.contains(table));if(!available.length)return snapshot;
  const tx=db.transaction(available,'readonly'),complete=new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(new Error('legacy_read_failed'));});void complete.catch(()=>{});
  const rows=await Promise.all(available.map(async table=>[table,await request<unknown[]>(tx.objectStore(table).getAll())] as const));await complete;
  for(const [table,values]of rows)for(const raw of values){
   if(!raw||typeof raw!=='object')throw new Error('legacy_record_invalid');const row=raw as Record<string,unknown>;
   if(table==='blobs'){if(typeof row.id==='string'&&row.blob instanceof Blob)snapshot.blobs.set(row.id,row.blob);continue;}
   if(table==='receipts'&&!receiptKinds.has(String(row.kind))&&!(row.beforeGraph&&row.afterGraph)&&!('undoStack'in row)&&!String(row.id).startsWith('import-history:'))continue;
   const safe=portableMigrationContent(raw);
   if(table==='projects')snapshot.projects.push(projectSchema.parse(safe));else if(table==='graphs')snapshot.graphs.push(graphSchema.parse(safe));else if(table==='assets')snapshot.assets.push(assetSchema.parse(safe));else {
    const kind:WorkspaceMigration['records'][number]['kind']=table==='prompts'?'prompt':table==='promptDrafts'?'draft':table==='runs'?'video-history':table==='promptRuns'?'text-history':table==='proposals'?'agent-proposal':table==='references'?'reference-history':'receipt-history';
    snapshot.records.push(migrationRecordSchema.parse({kind,id:row.id,schemaVersion:1,document:safe,readonly:true}));
   }
  }
  return snapshot;
 }finally{db.close();}
}
