import {IDBFactory} from 'fake-indexeddb';
import {openStudioDb,transact} from '../../src/infrastructure/storage/database';
import {acquireProjectLease} from '../../src/infrastructure/storage/project-lease';
import {createAuthBinding} from '../../src/domain/authorization';
import {setSessionCredential,withCredential} from '../../src/security/credential-session';
import {createCoreClient} from '../../src/adapters/core/http-client';
import {preflightRun,sealRunPlan} from '../../src/application/runs/preflight';
import {approveRun} from '../../src/application/runs/approval';
import {submitVideo} from '../../src/application/runs/submit-video';
import {startMockCore} from '../mock-core/server';
import {f} from './fixtures';
export async function videoHarness(){
 const spec={modelId:'fake-video-only',durationSeconds:5,ratio:'9:16'},capability=f.caps({videoSpecs:[spec],limits:{promptBytes:65536,imageReferences:0,videoReferences:0}}),db=await openStudioDb({factory:new IDBFactory(),name:'video-harness'}),mock=await startMockCore();
 try{
  const graph=f.graph({nodes:[{id:'t1',type:'text',title:'文字',x:0,y:0,locked:false,data:{kind:'text',text:'原创轮询测试',referenceTokens:[]}},{id:'v1',type:'video-generation',title:'视频',x:400,y:0,locked:false,data:{kind:'video-generation',draft:spec,inputBindings:[],stale:false}}],edges:[{id:'e1',sourceId:'t1',targetId:'v1',port:'text',order:0}]});
  await transact(db,['projects','graphs','diagnostics'],'readwrite',tx=>{tx.objectStore('projects').put(f.project());tx.objectStore('graphs').put(graph);tx.objectStore('diagnostics').put({id:'capability:current',capability});});
  const claim=await acquireProjectLease('p1','harness-tab',Date.now(),{db});if(!claim.ok)throw Error('test lease');const lease=claim.token,profile=f.connection(),binding=createAuthBinding(profile);setSessionCredential(binding.id,'fake-harness-key');
  const client=createCoreClient(profile,{binding,withCredential},{registry:[profile],browserOrigin:'http://127.0.0.1:4179',fetch:async(url,init)=>fetch(mock.origin+new URL(String(url)).pathname.replace(/^\/core-api/,''),init)}),options={db,lease,client,capability,tabId:'harness-tab'};
  const result=preflightRun({graph,nodeIds:['v1'],assets:[],readableAssetIds:[],capability,connection:profile,binding,canWrite:true,credentialAvailable:true});if(result.status!=='ready')throw Error('test plan');const plan=await sealRunPlan(result.plan),approved=await approveRun(plan,{confirmed:true,kind:'video',planHash:plan.planHash,nodeCount:1,acknowledgeUnknownFee:true},options),runId=approved.runIds[0],run=await submitVideo(runId,options);
  return {db,mock,client,capability,lease,runId,run,options,close:async()=>{await mock.close();db.close();}};
 }catch(error){await mock.close();db.close();throw error;}
}
