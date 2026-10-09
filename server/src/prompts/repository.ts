import {randomUUID,createHash} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import type {AuthContext} from '../auth/context.js';
import {transaction} from '../db/transaction.js';
import {HttpError} from '../errors.js';
import {parseContent,promptDraftSchema,type ContentKind,type Content} from './contracts.js';
import {ownedProject,readProjectGraph} from '../projects/repository.js';
import {compileVideoPrompt} from '../../../src/domain/prompt-engine/compile-video.js';
import type {PromptCompileResult} from '../../../src/domain/prompt.js';
export type ContentRow={kind:ContentKind;document:unknown;revision:number;trashed_at:Date|null};
export async function ownedContent(db:Pool|PoolClient,context:AuthContext,id:string,kind:ContentKind,lock=false){
 const rows=await db.query<ContentRow>('SELECT kind,document,revision,trashed_at FROM workspace_content WHERE user_id=$1 AND id::text=$2 AND kind=$3'+(lock?' FOR UPDATE':''),[context.userId,id,kind]);
 if(!rows.rows[0])throw new HttpError(404,'NOT_FOUND');return {row:rows.rows[0],document:parseContent(kind,rows.rows[0].document)};
}
export function contentAssetIds(input:unknown){
 const ids=new Set<string>();function visit(value:unknown){if(!value||typeof value!=='object')return;for(const [key,item]of Object.entries(value)){if(['assetId','sourceAssetId','resultAssetId'].includes(key)&&typeof item==='string')ids.add(item);else visit(item);}}visit(input);return [...ids];
}
export async function validateContentResources(db:PoolClient,context:AuthContext,document:Content){
 const ids=contentAssetIds(document);
 if(ids.length){const assets=await db.query("SELECT id FROM workspace_assets WHERE user_id=$1 AND id::text=ANY($2::text[]) AND state='complete' AND trashed_at IS NULL ORDER BY id FOR SHARE",[context.userId,ids]);if(assets.rows.length!==ids.length)throw new HttpError(404,'NOT_FOUND');}
 if('sourceProjectId' in document&&document.sourceProjectId){
  await ownedProject(db,context,document.sourceProjectId);
  if(document.sourceNodeId){
   const graph=await readProjectGraph(db,context,document.sourceProjectId);
   if(!graph.nodes.some(node=>node.id===document.sourceNodeId)){
    const history=await db.query('SELECT 1 FROM workspace_command_receipts WHERE user_id=$1 AND project_id=$2 AND (before_graph->\'nodes\' @> $3::jsonb OR after_graph->\'nodes\' @> $3::jsonb) LIMIT 1',[context.userId,document.sourceProjectId,JSON.stringify([{id:document.sourceNodeId}])]);if(!history.rows.length)throw new HttpError(404,'NOT_FOUND');
   }
  }
 }else if('sourceNodeId' in document&&document.sourceNodeId)throw new HttpError(400,'INVALID_REQUEST');
}
export async function writeContent(db:PoolClient,context:AuthContext,kind:ContentKind,document:Content,now:Date,trashed=false){
 await validateContentResources(db,context,document);
 const result=await db.query('UPDATE workspace_content SET revision=$3,document=$4::jsonb,updated_at=$5,trashed_at=$6 WHERE user_id=$1 AND id=$2',[context.userId,document.id,document.revision,JSON.stringify(document),now,trashed?now:null]);
 if(result.rowCount!==1)throw new Error('Content update incomplete');
 await db.query('INSERT INTO workspace_content_versions(user_id,id,revision,document,created_at) VALUES($1,$2,$3,$4::jsonb,$5)',[context.userId,document.id,document.revision,JSON.stringify(document),now]);
 for(const assetId of contentAssetIds(document))await db.query('INSERT INTO workspace_content_assets(user_id,content_id,asset_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[context.userId,document.id,assetId]);
 return parseContent(kind,document);
}
export async function createContent(pool:Pool,context:AuthContext,kind:ContentKind,input:Record<string,unknown>&{idempotencyKey:string},now:Date){
 const {idempotencyKey,...fields}=input,fingerprint=createHash('sha256').update(JSON.stringify({kind,...fields})).digest('hex');
 return transaction(pool,async db=>{
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[context.userId+':content-create:'+idempotencyKey]);
  const prior=await db.query<{content_id:string;fingerprint:string}>('SELECT content_id,fingerprint FROM workspace_content_creations WHERE user_id=$1 AND id=$2',[context.userId,idempotencyKey]);
  if(prior.rows[0]){if(prior.rows[0].fingerprint!==fingerprint)throw new HttpError(409,'IDEMPOTENCY_CONFLICT');return (await ownedContent(db,context,prior.rows[0].content_id,kind)).document;}
  const document=parseContent(kind,{...fields,id:randomUUID(),revision:0,...(kind==='prompt'?{trashed:false}:{resultVersions:[]})});
  await validateContentResources(db,context,document);
  await db.query('INSERT INTO workspace_content(user_id,id,kind,revision,document,created_at,updated_at) VALUES($1,$2,$3,0,$4::jsonb,$5,$5)',[context.userId,document.id,kind,JSON.stringify(document),now]);
  await writeContent(db,context,kind,document,now);
  await db.query('INSERT INTO workspace_content_creations(user_id,id,content_id,fingerprint) VALUES($1,$2,$3,$4)',[context.userId,idempotencyKey,document.id,fingerprint]);return document;
 });
}
export async function listContent(pool:Pool,context:AuthContext,kind:ContentKind,trashed=false){const rows=await pool.query<ContentRow>('SELECT kind,document,revision,trashed_at FROM workspace_content WHERE user_id=$1 AND kind=$2 AND '+(trashed?'trashed_at IS NOT NULL':'trashed_at IS NULL')+' ORDER BY updated_at DESC,id',[context.userId,kind]);return rows.rows.map(row=>parseContent(kind,row.document));}
export async function contentRevision(pool:Pool,context:AuthContext,id:string,kind:ContentKind,revision:number){
 await ownedContent(pool,context,id,kind);const result=await pool.query<{document:unknown}>('SELECT document FROM workspace_content_versions WHERE user_id=$1 AND id=$2 AND revision=$3',[context.userId,id,revision]);if(!result.rows[0])throw new HttpError(404,'NOT_FOUND');return parseContent(kind,result.rows[0].document);
}
export async function changeContent(pool:Pool,context:AuthContext,id:string,kind:ContentKind,expectedRevision:number,patch:Record<string,unknown>,now:Date,action:'patch'|'trash'|'restore'|'compile'='patch'){
 return transaction(pool,async db=>{
  const {row,document}=await ownedContent(db,context,id,kind,true);
  if(document.revision!==expectedRevision)throw new HttpError(409,'REVISION_CONFLICT');
  if(row.trashed_at&&['patch','compile'].includes(action))throw new HttpError(409,'CONTENT_IN_TRASH');
  const trashed=action==='trash'||action==='patch'&&row.trashed_at!==null;
  let next=parseContent(kind,{...document,...patch,revision:document.revision+1,...(kind==='prompt'?{trashed}:{})});
  if(action==='compile'){
   const draft=promptDraftSchema.parse(document);let result;
   if(draft.type!=='video')throw new HttpError(400,'INVALID_REQUEST');
   const {userRequest,sceneId,requestedSpec,audioPlan,lockedConstraints,references}=draft;
   try{result=compileVideoPrompt({userRequest,sceneId,requestedSpec,audioPlan,lockedConstraints,references});}catch{throw new HttpError(400,'INVALID_REQUEST');}
   next=promptDraftSchema.parse({...draft,revision:draft.revision+1,resultVersions:[...draft.resultVersions,{...result,id:randomUUID(),sourceRevision:draft.revision,origin:'local',validationState:'unchecked',createdAt:now.getTime()}]});
  }
  return writeContent(db,context,kind,next,now,trashed);
 });
}
export async function appendManualResult(pool:Pool,context:AuthContext,id:string,expectedRevision:number,input:PromptCompileResult|string,now:Date){
 return transaction(pool,async db=>{
  const {row,document}=await ownedContent(db,context,id,'draft',true),draft=promptDraftSchema.parse(document);
  if(row.trashed_at)throw new HttpError(409,'CONTENT_IN_TRASH');if(draft.revision!==expectedRevision)throw new HttpError(409,'REVISION_CONFLICT');
  const source=typeof input==='string'?draft.resultVersions.find(version=>version.id===input):undefined;
  if(typeof input==='string'&&!source)throw new HttpError(404,'NOT_FOUND');
  let content:PromptCompileResult;
  if(source){const {finalPrompt,shotPlan,improvements,warnings,suggestedSpec}=source;content={finalPrompt,shotPlan,improvements,warnings,suggestedSpec};}else content=input as PromptCompileResult;
  const version={...content,id:randomUUID(),sourceRevision:draft.revision,origin:'manual',validationState:'unchecked',createdAt:now.getTime(),...(source?{restoredFromVersionId:source.id}:{})};
  const next=promptDraftSchema.parse({...draft,revision:draft.revision+1,resultVersions:[...draft.resultVersions,version]});
  return writeContent(db,context,'draft',next,now);
 });
}
