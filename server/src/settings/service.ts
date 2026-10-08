import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import type {AuthContext} from '../auth/context.js';
import {transaction} from '../db/transaction.js';
import {HttpError} from '../errors.js';
import type {ApiSecrets} from '../security/api-secrets.js';
import {normalizeModelBase,type ModelChannel,type RestrictedOutbound} from '../security/outbound.js';
import {configView,findConfig,readSecret,type ConfigRow} from './repository.js';
import {probeModels} from './probe.js';
export type ApiSettingsDependencies={secrets:ApiSecrets;outbound:RestrictedOutbound};
export type SaveModelConfig={apiBase:string;model:string;apiKey?:string;expectedRevision:number|null};
export type TestModelConfig={apiBase:string;apiKey?:string;requestId:string};
export async function saveConfig(pool:Pool,context:AuthContext,channel:ModelChannel,input:SaveModelConfig,dependencies:ApiSettingsDependencies,now:Date){
 const apiBase=normalizeModelBase(input.apiBase);
 return transaction(pool,async db=>{
  // Lock the authenticated owner to serialize first insert and all revision updates.
  await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[context.userId]);
  const old=await findConfig(db,context,channel);
  if(old?input.expectedRevision!==old.revision:input.expectedRevision!==null)throw new HttpError(409,'REVISION_CONFLICT');
  if(!input.apiKey&&(!old||old.api_base!==apiBase))throw new HttpError(422,'API_KEY_REQUIRED');
  const id=old?.id??randomUUID(),version=input.apiKey?(old?.active_secret_version??0)+1:old!.active_secret_version;
  const sealed=input.apiKey?dependencies.secrets.seal({userId:context.userId,configId:id,secretVersion:version},input.apiKey):undefined;
  const result=await db.query<ConfigRow>('INSERT INTO api_configs(id,user_id,channel,api_base,model,revision,active_secret_version,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(user_id,channel) DO UPDATE SET api_base=EXCLUDED.api_base,model=EXCLUDED.model,revision=EXCLUDED.revision,active_secret_version=EXCLUDED.active_secret_version,updated_at=EXCLUDED.updated_at RETURNING id,user_id,channel,api_base,model,revision,active_secret_version',[id,context.userId,channel,apiBase,input.model,(old?.revision??0)+1,version,now]);
  if(sealed)await db.query('INSERT INTO api_secret_versions(config_id,user_id,secret_version,key_version,nonce,ciphertext,tag,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,context.userId,version,sealed.keyVersion,sealed.nonce,sealed.ciphertext,sealed.tag,now]);
  return configView(result.rows[0]!);
 });
}
export async function testConfig(pool:Pool,context:AuthContext,channel:ModelChannel,input:TestModelConfig,dependencies:ApiSettingsDependencies){
 const apiBase=normalizeModelBase(input.apiBase);let key=input.apiKey;
 if(!key){
  const config=await findConfig(pool,context,channel);if(!config||config.api_base!==apiBase)throw new HttpError(422,'API_KEY_REQUIRED');
  const sealed=await readSecret(pool,context,config);if(!sealed)throw new HttpError(500,'SECRET_UNAVAILABLE');
  key=dependencies.secrets.open({userId:context.userId,configId:config.id,secretVersion:config.active_secret_version},sealed);
 }
 return probeModels(dependencies.outbound,channel,apiBase,key,input.requestId);
}
