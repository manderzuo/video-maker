import type {Pool,PoolClient} from 'pg';
import type {AuthContext} from '../auth/context.js';
import type {ModelChannel} from '../security/outbound.js';
import type {SealedSecret} from '../security/api-secrets.js';
export type ConfigRow={id:string;user_id:string;channel:ModelChannel;api_base:string;model:string;revision:number;active_secret_version:number};
export type ModelConfigView={channel:ModelChannel;apiBase:string;model:string;revision:number;hasKey:boolean};
export function configView(row:ConfigRow):ModelConfigView{return {channel:row.channel,apiBase:row.api_base,model:row.model,revision:row.revision,hasKey:row.active_secret_version>0};}
export async function listConfigs(pool:Pool,context:AuthContext){const result=await pool.query<ConfigRow>('SELECT id,user_id,channel,api_base,model,revision,active_secret_version FROM api_configs WHERE user_id=$1 ORDER BY channel',[context.userId]);return result.rows.map(configView);}
export async function findConfig(db:Pool|PoolClient,context:AuthContext,channel:ModelChannel){const result=await db.query<ConfigRow>('SELECT id,user_id,channel,api_base,model,revision,active_secret_version FROM api_configs WHERE user_id=$1 AND channel=$2',[context.userId,channel]);return result.rows[0];}
export async function readSecret(db:Pool|PoolClient,context:AuthContext,row:ConfigRow):Promise<SealedSecret|undefined>{
 const result=await db.query<{key_version:string;nonce:Buffer;ciphertext:Buffer;tag:Buffer}>('SELECT key_version,nonce,ciphertext,tag FROM api_secret_versions WHERE user_id=$1 AND config_id=$2 AND secret_version=$3',[context.userId,row.id,row.active_secret_version]);
 const secret=result.rows[0];return secret?{keyVersion:secret.key_version,nonce:secret.nonce,ciphertext:secret.ciphertext,tag:secret.tag}:undefined;
}
