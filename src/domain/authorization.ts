import {z} from 'zod';
import {id,timestamp,type RunBinding,type ValidationResult} from './common';
import {connectionSchema,type ConnectionProfile} from './connection';
export const authBindingSchema=z.strictObject({id,connectionId:id,originSnapshot:z.url(),kind:z.literal('core-user'),createdAt:timestamp});
export type AuthBinding=z.infer<typeof authBindingSchema>;
export function createAuthBinding(connection:ConnectionProfile):AuthBinding{
 const profile=connectionSchema.parse(connection);
 return {id:crypto.randomUUID(),connectionId:profile.id,originSnapshot:profile.originSnapshot,kind:'core-user',createdAt:Date.now()};
}
export function validateBinding(run:RunBinding,binding:AuthBinding):ValidationResult<RunBinding>{
 if(!authBindingSchema.safeParse(binding).success||run.connectionId!==binding.connectionId||run.authBindingId!==binding.id||run.originSnapshot!==binding.originSnapshot)return {ok:false,issues:[{code:'original_authorization_required',path:'authBindingId',message:'旧任务需要原服务与原授权绑定'}]};
 return {ok:true,value:{...run}};
}
export function copyConnectionConfiguration(input:ConnectionProfile):ConnectionProfile{return structuredClone(connectionSchema.parse(input));}
