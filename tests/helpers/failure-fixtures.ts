import {preparedVideoHarness} from './video-harness';
import {prepareVideoRequest} from '../../src/application/runs/prepare-request';
import {submitVideo} from '../../src/application/runs/submit-video';
import {readRun} from '../../src/infrastructure/storage/run-repository';
import {openStudioDb,type StudioDb} from '../../src/infrastructure/storage/database';
export type CrashPoint='before-send'|'after-send-before-reply';
export async function runCrashScenario(name:CrashPoint){
 const h=await preparedVideoHarness(name==='after-send-before-reply'?{loseSubmitResponse:true}:{});let reopened:StudioDb|undefined;
 const posts=()=>h.mock.requests.filter(r=>r.method==='POST'&&r.path==='/v1/videos/generations').length;
 try{
  if(name==='before-send')await prepareVideoRequest(h.runId,h.options);else await submitVideo(h.runId,h.options);
  const original=(await readRun(h.runId,h.db))!,videoSubmissions=posts();h.db.close();
  reopened=await openStudioDb({factory:h.factory,name:'video-harness'});const run=(await readRun(h.runId,reopened))!;let resumedDispatchError:string|undefined;
  if(name==='after-send-before-reply')try{await submitVideo(h.runId,{...h.options,db:reopened});}catch(error){resumedDispatchError=(error as Error).message;}
  return {name,videoSubmissions,run,original,reopenedPaidRequests:posts()-videoSubmissions,resumedDispatchError,storage:'fake-indexeddb' as const};
 }finally{reopened?.close();await h.close();}
}
