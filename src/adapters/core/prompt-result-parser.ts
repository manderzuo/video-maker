import {promptCompileResultSchema,requestedSpecSchema,shotSchema,promptDraftSchema,promptRunSchema,type PromptCompileResult,type PromptResultVersion} from '../../domain/prompt';
import {byteLength,isSafeSnapshot,localText,type ValidationIssue} from '../../domain/common';
import {withDatabase,transact,requestResult,type StudioDb} from '../../infrastructure/storage/database';
import {capabilitySchema,unverifiedCapabilities,type CapabilityProfile} from '../../domain/connection';
import {readPromptRun,putPromptRunInTransaction} from '../../features/prompt-generation/prompt-run-repository';
import {readDraftRevision,readDraft} from '../../features/prompt-generation/draft-repository';
import {putPromptResultInTransaction} from '../../features/prompt-generation/result-versions';
import {compileInput} from '../../features/prompt-generation/workspace-service';
import {validatePromptResult} from '../../domain/prompt-engine/validate-result';
import {fingerprintText} from '../../application/runs/fingerprint';
import {sanitizeKnownSecrets} from '../../security/credential-session';
import {z} from 'zod';
export type PromptParseResult={status:'parsed'|'needs_review'|'invalid';format:'json'|'legacy'|'text';raw:string;result?:PromptCompileResult;issues:ValidationIssue[]};
const strictResult=promptCompileResultSchema.extend({shotPlan:z.array(shotSchema.strict())}).strict();
const creativeSpecFields=new Set(['aspectRatio','audio','frameRate','motionIntensity','resolution','shotCount','style']);
export function parsePromptResponse(raw:unknown):PromptParseResult{
 let text='';if(typeof raw==='string')text=raw;else if(isSafeSnapshot(raw)){try{text=JSON.stringify(raw);}catch{/* Invalid shape is reported below. */}}
 const invalid=(code:string,message:string):PromptParseResult=>({status:'invalid',format:'text',raw:sanitizeKnownSecrets(text),issues:[{code,path:'result',message}]});
 if(byteLength(text)>65536){text='';return invalid('prompt_response_too_large','响应超过64KiB，不能作为结果导入。');}if(!text.trim())return invalid('prompt_response_empty','文字响应为空。');text=sanitizeKnownSecrets(text);
 let object:unknown;try{const content=text.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i,'$1');object=JSON.parse(content);}catch{/* Only the explicit frozen-source markers are a supported fallback. */}
 if(object!==undefined){const parsed=strictResult.safeParse(object);if(parsed.success)return {status:'parsed',format:'json',raw:text,result:parsed.data,issues:[]};
  if(object&&typeof object==='object'&&!Array.isArray(object)&&isSafeSnapshot(object)){
   const record=object as Record<string,unknown>,allowed=['finalPrompt','shotPlan','improvements','warnings','suggestedSpec'];
   if(Object.keys(record).every(key=>allowed.includes(key))&&record.suggestedSpec&&typeof record.suggestedSpec==='object'&&!Array.isArray(record.suggestedSpec)){
    const spec=record.suggestedSpec as Record<string,unknown>,extra=Object.keys(spec).filter(key=>key!=='durationSeconds'&&key!=='ratio');
    if(extra.length&&extra.every(key=>creativeSpecFields.has(key))){const safeSpec={...(spec.durationSeconds!==undefined?{durationSeconds:spec.durationSeconds}:{}),...(spec.ratio!==undefined?{ratio:spec.ratio}:{})},review=strictResult.safeParse({...record,suggestedSpec:safeSpec});
     if(review.success)return {status:'needs_review',format:'json',raw:text,result:review.data,issues:[{code:'prompt_spec_extra_fields',path:'suggestedSpec',message:`模型返回了非执行规格字段（${extra.join('、')}）；已从可执行规格中排除，请核对原文。`}]};
    }
   }
  }
  return invalid('prompt_result_schema_invalid','结构化结果字段不完整或包含未知字段；原文保留，需人工检查。');}
 const markers=['[FINAL_PROMPT]','[IMPROVEMENTS]','[PARAMETERS]'],positions=markers.map(marker=>text.indexOf(marker));
 if(positions.some((at,i)=>at<0||text.indexOf(markers[i],at+1)>=0)||!(positions[0]<positions[1]&&positions[1]<positions[2]))return invalid('prompt_response_parse_failed','文字未符合JSON或明确旧标记格式；原文保留，不自动修复或再次请求。');
 const finalPrompt=text.slice(positions[0]+markers[0].length,positions[1]).trim(),improvements=text.slice(positions[1]+markers[1].length,positions[2]).trim().split('\n').map(line=>line.trim()).filter(Boolean),parameters=text.slice(positions[2]+markers[2].length).trim();if(!finalPrompt)return invalid('prompt_result_empty','旧格式结果正文为空。');
 let suggestedSpec:PromptCompileResult['suggestedSpec']={};try{const parsed=requestedSpecSchema.safeParse(JSON.parse(parameters));if(parsed.success)suggestedSpec=parsed.data;}catch{/* Plain legacy parameters are retained, never guessed into runnable options. */}
 return {status:'needs_review',format:'legacy',raw:text,result:{finalPrompt,shotPlan:[],improvements,warnings:['旧标记格式需人工校验。',...(parameters?['原参数说明：'+parameters]:[])],suggestedSpec},issues:[{code:'legacy_prompt_needs_review',path:'result',message:'旧标记结果与参数仅为候选，请人工校验。'}]};
}
const journalSchema=z.strictObject({id:z.string(),promptRunId:z.string(),draftId:z.string(),draftRevision:z.number().int().positive(),requestHash:z.string().regex(/^[a-f0-9]{64}$/),planHash:z.string().regex(/^[a-f0-9]{64}$/),content:localText,redacted:z.boolean(),requestId:z.string().regex(/^[-A-Za-z0-9._~]{1,256}$/).refine(id=>sanitizeKnownSecrets(id)===id).optional(),at:z.number().int().nonnegative()});
export async function readSavedPromptResponse(runId:string,db?:StudioDb){return withDatabase(db,async connection=>{const run=await readPromptRun(runId,connection);if(!run)throw Error('prompt_run_missing');const reply=journalSchema.parse(await transact(connection,['receipts'],'readonly',tx=>requestResult<unknown>(tx.objectStore('receipts').get('prompt-response:'+runId))));if(reply.promptRunId!==run.id||reply.id!=='prompt-response:'+run.id||reply.draftId!==run.draftId||reply.draftRevision!==run.draftRevision||reply.requestHash!==await fingerprintText(run.requestSnapshot)||sanitizeKnownSecrets(reply.content)!==reply.content||!localText.safeParse(reply.content).success)throw Error('prompt_response_identity_mismatch');return reply;});}
export async function readPromptInspection(draftId:string,db?:StudioDb){return withDatabase(db,async connection=>{const diagnostics=await transact(connection,['diagnostics'],'readonly',tx=>requestResult<unknown[]>(tx.objectStore('diagnostics').getAll())),schema=z.object({id:z.string(),draftId:z.string(),promptRunId:z.string(),sourceRevision:z.number().int(),at:z.number().int()}),rows=diagnostics.map(row=>schema.safeParse(row)).filter(row=>row.success&&row.data.id==='prompt-parse:'+row.data.promptRunId&&row.data.draftId===draftId).flatMap(row=>row.success?[row.data]:[]).sort((a,b)=>b.at-a.at);
 const diagnostic=rows[0];let promptRunId=diagnostic?.promptRunId;if(!promptRunId){const saved=await transact(connection,['promptRuns'],'readonly',tx=>requestResult<unknown[]>(tx.objectStore('promptRuns').getAll())),runs=saved.map(row=>promptRunSchema.safeParse(row)).filter(row=>row.success&&row.data.draftId===draftId&&row.data.executionState==='succeeded').flatMap(row=>row.success?[row.data]:[]).sort((a,b)=>b.startedAt-a.startedAt);for(const run of runs){const receipt=await transact(connection,['receipts'],'readonly',tx=>requestResult<unknown>(tx.objectStore('receipts').get('prompt-response:'+run.id)));if(receipt){promptRunId=run.id;break;}}}if(!promptRunId)return;
 const reply=await readSavedPromptResponse(promptRunId,connection),source=await readDraftRevision(draftId,reply.draftRevision,connection),current=await readDraft(draftId,connection);if(!source||diagnostic&&diagnostic.sourceRevision!==reply.draftRevision)throw Error('prompt_input_revision_missing');return {promptRunId,parsed:parsePromptResponse(reply.content),source,candidate:current?.resultVersions.find(v=>v.promptRunId===promptRunId)};
});}
export async function attachPromptRunResult(runId:string,result:PromptParseResult,options:{db?:StudioDb;capability?:CapabilityProfile}={}):Promise<PromptResultVersion|undefined>{return withDatabase(options.db,async db=>{
 const run=await readPromptRun(runId,db);if(!run)throw Error('prompt_run_missing');const reply=journalSchema.parse(await transact(db,['receipts'],'readonly',tx=>requestResult<unknown>(tx.objectStore('receipts').get('prompt-response:'+runId))));
 if(reply.promptRunId!==run.id||reply.id!=='prompt-response:'+run.id||reply.draftId!==run.draftId||reply.draftRevision!==run.draftRevision||reply.requestHash!==await fingerprintText(run.requestSnapshot)||sanitizeKnownSecrets(reply.content)!==reply.content)throw Error('prompt_response_identity_mismatch');
 const parsed=parsePromptResponse(reply.content);if(JSON.stringify(parsed)!==JSON.stringify(result))throw Error('prompt_candidate_mismatch');const source=await readDraftRevision(run.draftId,run.draftRevision,db);if(!source)throw Error('prompt_input_revision_missing');
 const storedCaps=await transact(db,['diagnostics'],'readonly',tx=>requestResult<{capability?:unknown}|undefined>(tx.objectStore('diagnostics').get('capability:current'))),checkedCaps=capabilitySchema.safeParse(options.capability??storedCaps?.capability),caps=checkedCaps.success?checkedCaps.data:unverifiedCapabilities();
 let candidate:PromptResultVersion|undefined;const issues=[...parsed.issues];if(parsed.result){candidate={...parsed.result,id:'ai:'+run.id,sourceRevision:run.draftRevision,origin:'ai',promptRunId:run.id,createdAt:reply.at,validationState:'unchecked'};issues.push(...validatePromptResult(candidate,compileInput(source),caps));if(reply.redacted)issues.push({code:'response_redacted',path:'result',message:'响应含已脱敏内容，需要人工核对。'});candidate.validationState=issues.length||parsed.status!=='parsed'?'needs_review':'valid';}
 return transact(db,['promptDrafts','promptRuns','receipts','diagnostics'],'readwrite',async tx=>{
  const current=await requestResult(tx.objectStore('promptRuns').get(run.id)),journal=await requestResult(tx.objectStore('receipts').get(reply.id));if(JSON.stringify(current)!==JSON.stringify(run)||JSON.stringify(journal)!==JSON.stringify(reply))throw Error('prompt_response_identity_mismatch');
  if(run.executionState!=='succeeded'){if(!['sending','response_unknown','waiting_stopped'].includes(run.executionState))throw Error('prompt_result_run_mismatch');await putPromptRunInTransaction(tx,{...run,executionState:'succeeded',...(reply.requestId?{coreRequestId:reply.requestId}:{}),finishedAt:reply.at},run.executionState);}
  if(candidate){const draft=promptDraftSchema.parse(await requestResult(tx.objectStore('promptDrafts').get(run.draftId)));await putPromptResultInTransaction(tx,draft,run.draftRevision,candidate);}
  tx.objectStore('diagnostics').put({id:'prompt-parse:'+run.id,draftId:run.draftId,sourceRevision:run.draftRevision,promptRunId:run.id,parsed,issues,at:reply.at});return candidate;
 });
});}
