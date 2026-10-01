import {z} from 'zod';
import {agentSessionSchema} from '../../src/domain/agent-session';
import {snapshotSchema,byteLength} from '../../src/domain/common';
import {validateCanvasToolInput,type ToolResult} from './mcp';
import type {AgentSessionStore} from './session';
export const toolEnvelopeSchema=z.strictObject({requestId:z.string().min(1).max(256),sessionId:z.string().min(1).max(256),name:z.string().min(1).max(64),input:snapshotSchema});
export const toolResultSchema=z.strictObject({status:z.enum(['ok','proposed','awaiting_browser_confirmation','awaiting_browser_proposal_confirmation','rejected']),data:snapshotSchema.optional(),errorCode:z.string().regex(/^[a-z_]+$/).optional()});
export const toolReplySchema=z.strictObject({sessionId:z.string().min(1).max(256),requestId:z.string().min(1).max(256),result:toolResultSchema});
type Envelope=z.infer<typeof toolEnvelopeSchema>;
type Job={envelope:Envelope;grant:string;delivered:boolean;settled:boolean;promise:Promise<ToolResult>;resolve:(result:ToolResult)=>void;timer:ReturnType<typeof setTimeout>;expiresAt:number};
export class ToolInbox{
 private jobs=new Map<string,Job>();
 constructor(private store:AgentSessionStore){}
 async submit(raw:unknown){const input=toolEnvelopeSchema.parse(raw),session=this.store.read(input.sessionId);validateCanvasToolInput(input.name,input.input,session);const key=input.sessionId+':'+input.requestId,serialized=JSON.stringify(input),prior=this.jobs.get(key);if(prior){if(JSON.stringify(prior.envelope)!==serialized)throw Error('agent_tool_request_id_reused');if(prior.grant!==JSON.stringify(session.grant))throw Error('agent_permission_changed');return prior.promise;}for(const [id,job]of this.jobs)if(job.settled&&job.expiresAt<Date.now())this.jobs.delete(id);if(this.jobs.size>=100||[...this.jobs.values()].filter(j=>!j.settled).length>=16)throw Error('agent_tool_queue_limit');let resolve!:(result:ToolResult)=>void;const promise=new Promise<ToolResult>(done=>{resolve=done;}),job:Job={envelope:structuredClone(input),grant:JSON.stringify(session.grant),delivered:false,settled:false,promise,resolve,timer:setTimeout(()=>this.finish(key,{status:'rejected',errorCode:'browser_tool_timeout'}),8000),expiresAt:Date.now()+60000};this.jobs.set(key,job);return promise;}
 poll(sessionId:string,nonce:string|undefined,origin:string){const live=this.store.browser(sessionId,nonce,origin);return [...this.jobs.entries()].filter(([,j])=>!j.settled&&!j.delivered&&j.envelope.sessionId===sessionId).flatMap(([key,job])=>{if(job.grant!==JSON.stringify(live.session.grant)){this.finish(key,{status:'rejected',errorCode:'agent_permission_changed'});return [];}job.delivered=true;return [{...structuredClone(job.envelope),session:agentSessionSchema.parse(structuredClone(live.session))}];});}
 reply(raw:unknown,nonce:string|undefined,origin:string){const input=toolReplySchema.parse(raw),live=this.store.browser(input.sessionId,nonce,origin),key=input.sessionId+':'+input.requestId,job=this.jobs.get(key);if(!job||!job.delivered||job.settled)throw Error('agent_tool_reply_unexpected');if(job.grant!==JSON.stringify(live.session.grant)){this.finish(key,{status:'rejected',errorCode:'agent_permission_changed'});throw Error('agent_permission_changed');}if(byteLength(JSON.stringify(input.result))>262144)throw Error('agent_response_too_large');this.finish(key,input.result);}
 private finish(key:string,result:ToolResult){const job=this.jobs.get(key);if(!job||job.settled)return;clearTimeout(job.timer);job.settled=true;job.resolve(structuredClone(result));}
 revoke(sessionId:string){for(const [key,job]of this.jobs)if(job.envelope.sessionId===sessionId&&!job.settled)this.finish(key,{status:'rejected',errorCode:'agent_disconnected'});}
 clear(){for(const key of this.jobs.keys())this.finish(key,{status:'rejected',errorCode:'agent_disconnected'});this.jobs.clear();}
}
