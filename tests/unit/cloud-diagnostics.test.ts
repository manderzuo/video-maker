import {expect,it} from 'vitest';
import type {CloudRun} from '../../src/domain/cloud-video-run';
import {buildCloudDiagnostics} from '../../src/features/workspace/cloud-diagnostics';
const run=()=>({id:'a0000000-0000-4000-8000-000000000001',kind:'video',projectId:'b0000000-0000-4000-8000-000000000002',nodeId:'c0000000-0000-4000-8000-000000000003',executionState:'succeeded',inputSnapshot:{prompt:'绝密提示词全文',spec:{modelId:'seedance'}},finalBody:JSON.stringify({prompt:'绝密提交原文'}),taskId:'core-task-1',coreRequestId:'core-req-1',secret:'do-not-export',apiKey:'do-not-export',createdAt:1,updatedAt:2,recordRevision:0}) as unknown as CloudRun;
const project=()=>({id:'b0000000-0000-4000-8000-000000000002',schemaVersion:1,title:'诊断项目',description:'',tags:[],starred:false,archived:false,revision:1,createdAt:1,updatedAt:2,trashedAt:null});
const receipt=()=>({id:'d0000000-0000-4000-8000-000000000004',projectId:'b0000000-0000-4000-8000-000000000002',revision:1,commandType:'operations' as const,createdAt:3});
it('exports only whitelisted diagnostic fields',()=>{
 const report=buildCloudDiagnostics({projects:[project()],receipts:[{project:project(),receipt:receipt()}],runs:[run()],configs:[{channel:'video',apiBase:'https://video.example.test',model:'seedance',hasKey:true}]});
 expect(report).toMatchObject({format:'aiwork-studio-cloud-diagnostics',version:1});
 expect(report.receipts).toHaveLength(1);expect(report.runs[0]).toMatchObject({id:'a0000000-0000-4000-8000-000000000001',kind:'video',executionState:'succeeded'});
 const text=JSON.stringify(report);
 for(const secret of ['绝密提示词全文','绝密提交原文','do-not-export','core-task-1','core-req-1'])expect(text).not.toContain(secret);
 expect(report.runs[0]).not.toHaveProperty('inputSnapshot');expect(report.runs[0]).not.toHaveProperty('finalBody');
});
