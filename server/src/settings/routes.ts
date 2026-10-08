import {z} from 'zod';
import type {FastifyInstance} from 'fastify';
import type {Pool} from 'pg';
import {requestAuthContext} from '../auth/context.js';
import {enforceRate,rateKey} from '../auth/rate-limit.js';
import {listConfigs} from './repository.js';
import {saveConfig,testConfig,type ApiSettingsDependencies} from './service.js';
const noQuery=z.strictObject({});
const params=z.strictObject({channel:z.enum(['video','text'])});
const apiBase=z.string().min(1).max(2048);
const apiKey=z.string().min(1).max(4096).refine(value=>value.trim()===value&&!/[\u0000-\u0020\u007f-\u009f*\u2022]/.test(value));
const model=z.string().trim().min(1).max(256).refine(value=>!/[\u0000-\u001f\u007f-\u009f]/.test(value));
const save=z.strictObject({apiBase,model,apiKey:apiKey.optional(),expectedRevision:z.number().int().min(0).max(2147483646).nullable()});
const test=z.strictObject({apiBase,apiKey:apiKey.optional(),requestId:z.string().min(1).max(128).regex(/^[A-Za-z0-9_.:-]+$/)});
export function registerApiSettingsRoutes(app:FastifyInstance,pool:Pool,dependencies:ApiSettingsDependencies,now:()=>Date){
 app.get('/studio-api/me/model-configs',async request=>{noQuery.parse(request.query);return {configs:await listConfigs(pool,requestAuthContext(request))};});
 app.patch('/studio-api/me/model-configs/:channel',async request=>{noQuery.parse(request.query);return saveConfig(pool,requestAuthContext(request),params.parse(request.params).channel,save.parse(request.body),dependencies,now());});
 app.post('/studio-api/me/model-configs/:channel/test',async request=>{
  noQuery.parse(request.query);const context=requestAuthContext(request),channel=params.parse(request.params).channel,input=test.parse(request.body),at=now();
  await enforceRate(pool,rateKey('api-probe-user',context.userId),10,60000,at);
  await enforceRate(pool,rateKey('api-probe-ip',request.ip),30,60000,at);
  return testConfig(pool,context,channel,input,dependencies);
 });
}
