import {expect,it} from 'vitest';
import {buildVideoRequestBody,type VideoRunSnapshot} from '../../src/domain/video-request';
import {parseVideoTask} from '../../src/adapters/core/contracts';
import {videoFailureDetails} from '../../src/domain/video-failure';
import {runSchema} from '../../src/domain/run';
import {f} from '../helpers/fixtures';

it.each(['image','video','none'] as const)('the Studio generate action explicitly requests new creation with %s references',media=>{
 const input:VideoRunSnapshot={prompt:'接上传画面的下一段，保持服装一致',spec:{modelId:'seedance',durationSeconds:5,ratio:'9:16',resolution:'480p'},references:media==='none'?[]:[{assetId:'local-reference',mediaType:media,role:'参考',alias:'素材1'}]};
 const body=JSON.parse(buildVideoRequestBody(input,media==='none'?[]:[{coreAssetId:'owned-reference'}]));
 expect(body).toMatchObject({action:'create',prompt:input.prompt,duration:5,resolution:'480p',ratio:'9:16'});
 expect(body).not.toHaveProperty('parent_version_id');
 if(media!=='none')expect(body[media+'_asset_ids']).toEqual(['owned-reference']);
});

it.each(['assistant_json_duplicate_key','assistant_json_invalid','assistant_output_truncated','assistant_schema_invalid','work_parent_required','work_decision_invalid'])('specific planning failure %s survives persistence and billing-only updates without provider text',code=>{
 const task=parseVideoTask({task:{id:'original-task',status:'failed',error:{code,billing_state:'settled',message:'PRIVATE_MODEL_RESPONSE'}}});
 expect(task.failure).toMatchObject({reasonCode:code,gatewayCode:code});
 const run=runSchema.parse({...f.run(),failure:task.failure,billingState:task.billingState});
 expect(run.failure?.reasonCode).toBe(code);
 const detail=videoFailureDetails(run.failure,run.billingState);
 expect(detail.message).toContain('视频');
 expect(detail.billingMessage).toContain('结算');
 expect(JSON.stringify(task)).not.toContain('PRIVATE_MODEL_RESPONSE');
});
