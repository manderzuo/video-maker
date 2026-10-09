import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {Pool} from 'pg';
import {transaction} from '../db/transaction.js';
import {HttpError} from '../errors.js';
import type {ApiSettingsDependencies} from '../settings/service.js';
import type {ConfigRow} from '../settings/repository.js';
import {frozenTaskKey,userSecrets} from '../tasks/prompt-repository.js';
import {ownedProject,readProjectGraph} from '../projects/repository.js';
import {ownedConversation,requireGrant} from './repository.js';
import {cloudAgentRunSchema,cloudAgentProposalSchema,type CloudAgentRun} from '../../../src/domain/cloud-agent.js';
import {agentGrantSchema,type AgentGrant} from '../../../src/domain/agent-session.js';
import {graphSchema,type Graph} from '../../../src/domain/graph.js';
import {parseAgentAdvice} from '../../../src/domain/agent-advice.js';
import type {Proposal} from '../../../src/domain/proposal.js';
type TaskRow={user_id:string;id:string;document:unknown;frozen_config:ConfigRow;frozen_graph:Graph;frozen_grant:AgentGrant;request_body:string;result_snapshot:{message:string;proposal?:Proposal}|null};
const context=(userId:string)=>({userId,sessionId:'persistent-agent',contextId:'persistent-agent'});
const responseSchema=z.object({choices:z.array(z.object({message:z.object({content:z.string().max(65536)})})).min(1)});
function redactor(keys:string[]){return (text:string)=>{for(const key of keys)text=text.split(key).join('[已隐藏密钥]');return text.replace(/Bearer\s+[^\s,;"']+/gi,'Bearer [已隐藏密钥]');};}
function sanitize(value:unknown,redact:(text:string)=>string,depth=0):unknown{if(depth>32)throw Error('agent_result_invalid');if(typeof value==='string')return redact(value);if(Array.isArray(value))return value.map(item=>sanitize(item,redact,depth+1));if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,sanitize(item,redact,depth+1)]));return value;}
async function finalizeOne(pool:Pool,now:Date){return transaction(pool,async db=>{
 const rows=await db.query<TaskRow>("SELECT user_id,id,document,frozen_config,frozen_graph,frozen_grant,request_body,result_snapshot FROM workspace_agent_runs WHERE document->>'executionState'='response_received' ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED"),row=rows.rows[0];if(!row)return false;
 const task=cloudAgentRunSchema.parse(row.document),owner=context(row.user_id),conversation=await ownedConversation(db,owner,task.conversationId,true),candidate=row.result_snapshot;if(!candidate)throw Error('Saved agent result missing');let proposalId:string|undefined,errorCode:CloudAgentRun['errorCode'];
 if(candidate.proposal){try{requireGrant(conversation,now,agentGrantSchema.parse(row.frozen_grant));const project=await ownedProject(db,owner,task.projectId);if(project.trashedAt!==null)throw new HttpError(409,'PROJECT_IN_TRASH');}catch{errorCode='GRANT_CHANGED';}
  if(!errorCode){const {sessionId:_,...base}=candidate.proposal;void _;const document=cloudAgentProposalSchema.parse({...base,conversationId:conversation.id,revision:0,grantEpoch:row.frozen_grant.epoch,message:candidate.message,decisions:[]});await db.query('INSERT INTO workspace_agent_proposals(user_id,id,conversation_id,document,frozen_grant) VALUES($1,$2,$3,$4::jsonb,$5::jsonb)',[row.user_id,document.id,conversation.id,JSON.stringify(document),JSON.stringify(row.frozen_grant)]);proposalId=document.id;}
 }
 const next=cloudAgentRunSchema.parse({...task,executionState:'succeeded',message:candidate.message,...(proposalId?{proposalId}:{}),...(errorCode?{errorCode}:{}),updatedAt:now.getTime()});await db.query('UPDATE workspace_agent_runs SET document=$3::jsonb,lease_until=NULL,updated_at=$4 WHERE user_id=$1 AND id=$2',[row.user_id,row.id,JSON.stringify(next),now]);return true;
});}
export async function executeNextAgentTask(pool:Pool,dependencies:ApiSettingsDependencies,clock:()=>Date=()=>new Date()){
 try{if(await finalizeOne(pool,clock()))return true;}catch{return false;}
 const now=clock(),row=await transaction(pool,async db=>{
  const rows=await db.query<TaskRow>("SELECT user_id,id,document,frozen_config,frozen_graph,frozen_grant,request_body,result_snapshot FROM workspace_agent_runs WHERE document->>'executionState'='persisted' ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED"),stored=rows.rows[0];if(!stored)return undefined;const task=cloudAgentRunSchema.parse(stored.document),owner=context(stored.user_id);let errorCode:CloudAgentRun['errorCode'];
  try{const conversation=await ownedConversation(db,owner,task.conversationId,true);requireGrant(conversation,now,agentGrantSchema.parse(stored.frozen_grant));const project=await ownedProject(db,owner,task.projectId),graph=await readProjectGraph(db,owner,task.projectId);if(project.trashedAt!==null||graph.revision!==task.inputSnapshot.revision)errorCode='GRAPH_CHANGED';}catch{errorCode='GRANT_CHANGED';}
  const document=cloudAgentRunSchema.parse({...task,executionState:errorCode?'failed_confirmed':'sending',...(errorCode?{errorCode}:{}),updatedAt:now.getTime()});await db.query('UPDATE workspace_agent_runs SET document=$3::jsonb,lease_until=$4,updated_at=$5 WHERE user_id=$1 AND id=$2',[stored.user_id,stored.id,JSON.stringify(document),errorCode?null:new Date(now.getTime()+150000),now]);return {...stored,document};
 });if(!row)return false;const task=cloudAgentRunSchema.parse(row.document);if(task.executionState==='failed_confirmed')return true;
 let result:TaskRow['result_snapshot']=null,errorCode:CloudAgentRun['errorCode'],notSent=false;
 try{
  const key=await frozenTaskKey(pool,row.user_id,row.frozen_config,dependencies),redact=redactor(await userSecrets(pool,row.user_id,dependencies));const reply=await dependencies.outbound.completion(row.frozen_config.api_base,key,row.request_body,'studio-agent-'+task.id,'studio-agent-conversation-'+task.conversationId);if(reply.status<200||reply.status>=300)throw new HttpError(502,'UPSTREAM_FAILED');
  try{const content=responseSchema.parse(JSON.parse(reply.body.toString('utf8'))).choices[0].message.content.trim().replace(/^```(?:json)?\s*/i,'').replace(/```$/,'');result=parseAgentAdvice(JSON.stringify(sanitize(JSON.parse(content),redact)),graphSchema.parse(row.frozen_graph),{id:task.conversationId,projectId:task.projectId,allowedOrigin:task.apiBase,connected:true,grant:agentGrantSchema.parse(row.frozen_grant)},randomUUID(),redact,now.getTime());}catch{errorCode='INVALID_UPSTREAM_RESULT';}
 }catch(error){notSent=error instanceof HttpError&&['OUTBOUND_BLOCKED','INVALID_API_KEY','INVALID_API_BASE','SECRET_UNAVAILABLE'].includes(error.code);errorCode=error instanceof HttpError&&error.code==='SECRET_UNAVAILABLE'?'SECRET_UNAVAILABLE':error instanceof HttpError&&error.code==='OUTBOUND_BLOCKED'?'OUTBOUND_BLOCKED':'UPSTREAM_FAILED';}
 const at=clock(),next=cloudAgentRunSchema.parse({...task,executionState:result?'response_received':notSent?'failed_confirmed':'response_unknown',billingState:result||notSent?'not_provided':'pending_reconciliation',...(errorCode?{errorCode}:{}),updatedAt:at.getTime()});await pool.query("UPDATE workspace_agent_runs SET document=$3::jsonb,result_snapshot=$4::jsonb,lease_until=NULL,updated_at=$5 WHERE user_id=$1 AND id=$2 AND document->>'executionState'='sending'",[row.user_id,row.id,JSON.stringify(next),result?JSON.stringify(result):null,at]);if(result)try{await finalizeOne(pool,clock());}catch{/* Saved sanitized response remains retryable without a second model call. */}return true;
}
export async function recoverExpiredAgentTasks(pool:Pool,now:Date){await pool.query("UPDATE workspace_agent_runs SET document=jsonb_set(jsonb_set(jsonb_set(jsonb_set(document,'{executionState}','\"response_unknown\"'),'{billingState}','\"pending_reconciliation\"'),'{errorCode}','\"UPSTREAM_FAILED\"'),'{updatedAt}',to_jsonb($2::bigint)),lease_until=NULL,updated_at=$1 WHERE document->>'executionState'='sending' AND lease_until<$1",[now,now.getTime()]);}
export function startAgentWorker(pool:Pool,dependencies:ApiSettingsDependencies,clock:()=>Date=()=>new Date()){let stopped=false,inFlight:Promise<void>|undefined;const tick=()=>{if(stopped||inFlight)return;inFlight=(async()=>{await recoverExpiredAgentTasks(pool,clock());await executeNextAgentTask(pool,dependencies,clock);})().catch(()=>{}).finally(()=>{inFlight=undefined;});};const timer=setInterval(tick,500);timer.unref();tick();return {async stop(){stopped=true;clearInterval(timer);await inFlight;}};}
