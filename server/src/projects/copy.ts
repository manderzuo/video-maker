import type {Pool} from 'pg';
import type {z} from 'zod';
import type {AuthContext} from '../auth/context.js';
import {HttpError} from '../errors.js';
import {projectCopySchema} from './contracts.js';
import {ownedProject,readWorkspace} from './repository.js';
import {exportProjectPackage,importProjectPackage} from './package.js';
import type {AssetStorageOptions} from '../assets/storage.js';
export async function copyProject(pool:Pool,context:AuthContext,id:string,input:z.infer<typeof projectCopySchema>,now:Date,storage?:AssetStorageOptions){
 const source=await ownedProject(pool,context,id),fingerprint=JSON.stringify({id,...input});
 const prior=await pool.query<{fingerprint:string;project_id:string}>('SELECT fingerprint,project_id FROM workspace_project_copies WHERE user_id=$1 AND id=$2',[context.userId,input.idempotencyKey]);
 if(prior.rows[0]){if(prior.rows[0].fingerprint!==fingerprint)throw new HttpError(409,'IDEMPOTENCY_CONFLICT');return readWorkspace(pool,context,prior.rows[0].project_id);}
 if(source.revision!==input.expectedRevision)throw new HttpError(409,'REVISION_CONFLICT');if(source.trashedAt!==null)throw new HttpError(409,'PROJECT_IN_TRASH');
 const data=await exportProjectPackage(pool,context,id,now,storage);
 data.project={...data.project,title:input.title??([...source.title].slice(0,57).join('')+' 副本'),starred:false,archived:false};data.history={receipts:[],undo:[],redo:[]};
 data.graph.nodes=data.graph.nodes.map(node=>node.type==='video-generation'?{...node,data:{...node.data,stale:true}}:node);
 return importProjectPackage(pool,context,{data,assets:Object.fromEntries(data.assets.map(item=>[item.asset.id,item.asset.id])),idempotencyKey:input.idempotencyKey},now,storage,{sourceId:id,expectedRevision:input.expectedRevision,fingerprint});
}
