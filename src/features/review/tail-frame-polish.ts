import type {Run} from '../../domain/run';
import {promptDraftSchema,type PromptDraft,type PromptResultVersion} from '../../domain/prompt';
import {localText} from '../../domain/common';
import {VIDEO_RULE_VERSION} from '../../domain/prompt-engine/compile-video';
import {readDraft,saveDraft} from '../prompt-generation/draft-repository';
import {preparePromptOptimization,optimizePrompt,type PromptOptimizationOptions,type PromptOptimizationPreview,type ApprovedPromptInput} from '../../application/prompts/optimize-text';
import {isTextOnlyModel} from '../../application/prompts/text-model-policy';
import {hasSessionCredential} from '../../security/credential-session';
import {readSavedPromptResponse,parsePromptResponse,attachPromptRunResult} from '../../adapters/core/prompt-result-parser';
import {withDatabase,transact,requestResult} from '../../infrastructure/storage/database';
import {textFailureMessage} from '../../ui/text-failure-message';
import {observeGeneration,observeGenerationFailure} from '../settings/connection-status';
export type TailPolishPreparation={draft:PromptDraft;preview:PromptOptimizationPreview;connection:PromptOptimizationOptions};

export async function prepareTailPolish(input:{run:Run;revision:number;prompt:string},connection:PromptOptimizationOptions):Promise<TailPolishPreparation>{
 const prompt=localText.parse(input.prompt.trim()),model=connection.capability.textModels.find(id=>isTextOnlyModel(id,connection.capability));
 if(!prompt||!model||!hasSessionCredential(connection.client.binding.id))throw Error('tail_text_connection_required');
 // Stable across closing/reopening: unknown earlier requests must still require review.
 const id='tail-polish:'+input.run.id,previous=await readDraft(id,connection.db),spec=input.run.executionSpec??input.run.requestedSpec;
 const requestedSpec={...(spec?.durationSeconds!==undefined?{durationSeconds:spec.durationSeconds}:{}),...(spec?.ratio?{ratio:spec.ratio}:{})};
 const draft=promptDraftSchema.parse({id,revision:previous?.revision??0,type:'video',ruleVersion:VIDEO_RULE_VERSION,sourceProjectId:input.run.projectId,sourceRevision:input.revision,userRequest:prompt,sceneId:'extension',requestedSpec,audioPlan:'',references:[],lockedConstraints:Object.entries(requestedSpec).map(([field,value])=>({id:'tail-spec:'+field,field,originalValue:String(value),acceptedValue:String(value),locked:true})),resultVersions:previous?.resultVersions??[]});
 const saved=await saveDraft(draft,draft.revision,{db:connection.db});if(saved.status!=='saved')throw Error('tail_prompt_save_failed');
 const source={...draft,revision:saved.revision},preview=await preparePromptOptimization(id,{textModelId:model,referenceAliases:[]},connection);
 return {draft:source,preview,connection};
}

export async function completeTailPolish(prepared:TailPolishPreparation,decision:ApprovedPromptInput['decision'],signal:AbortSignal):Promise<{candidate?:PromptResultVersion;error?:string;issues:string[]}>{
 const options={...prepared.connection,signal},model=prepared.preview.textModelId,success=observeGeneration(options.client,'text',model),failure=observeGenerationFailure(options.client,'text');
 const run=await optimizePrompt({preview:prepared.preview,decision},options);
 if(run.executionState!=='succeeded'){
  const reply=await withDatabase(options.db,db=>transact(db,['receipts'],'readonly',tx=>requestResult<{errorCode?:string;httpStatus?:number}|undefined>(tx.objectStore('receipts').get('prompt-response:'+run.id))));if(reply)failure(reply);
  return {error:(reply?textFailureMessage(reply)+' ':'')+'原文字请求已保留，不会自动重发。停止等待不代表取消或退款。',issues:[]};
 }
 const reply=await readSavedPromptResponse(run.id,options.db),parsed=parsePromptResponse(reply.content),candidate=await attachPromptRunResult(run.id,parsed,{db:options.db,capability:options.capability});
 if(!candidate)return {error:'AI响应解析失败，原响应已保留；下一段内容未修改，不会自动重发。',issues:parsed.issues.map(issue=>issue.message)};
 if(parsed.status==='parsed'&&!reply.redacted)success();
 return {candidate,issues:parsed.issues.map(issue=>issue.message)};
}
