import {createElement} from 'react';
import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {QueueControls} from '../../src/features/tasks/QueueControls';
import type {RunQueue} from '../../src/application/runs/queue';
import {f} from '../helpers/fixtures';

const queue:RunQueue={id:'queue:q1',queueId:'q1',projectId:'p1',revision:1,epoch:1,state:'completed',preparationConcurrency:1,items:[{nodeId:'n1',inputNodeIds:[],dependencyNodeIds:[],dependencyRunIds:[],requiresVisibleOutputs:[],runId:'r1',status:'accepted'}],planHashes:[],supersededRunIds:[],createdAt:1000,updatedAt:1000};
function html(executionState:ReturnType<typeof f.run>['executionState'],queryState:ReturnType<typeof f.run>['queryState']='polling'){
 return renderToStaticMarkup(createElement(QueueControls,{queue,nodes:[{id:'n1',type:'video-generation',title:'测试视频',x:0,y:0,locked:false,data:{kind:'video-generation',draft:{modelId:'fake-video-only'},inputBindings:[],stale:false}}],runs:[f.run({executionState,queryState})],canWrite:true,onPause:async()=>{},onResume:()=>{},onConcurrency:async()=>{}}));
}
describe('queue follows execution after submission',()=>{
 it('shows generating rather than a completed queue while Core is working',()=>{expect(html('running')).toContain('生成中');expect(html('running')).not.toContain('队列已结束');});
 it('shows the terminal failure after the submission item was accepted',()=>{expect(html('failed_confirmed','idle')).toContain('生成失败');});
 it('distinguishes authorization interruption from remote execution',()=>{expect(html('accepted','auth_required')).toContain('连接中断');});
});
