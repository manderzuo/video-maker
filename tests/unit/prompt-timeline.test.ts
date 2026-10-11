import {expect,it} from 'vitest';
import {resolveConstraints} from '../../src/domain/prompt-engine/constraints';
import {buildPromptOptimizationRequest} from '../../src/domain/prompt-engine/optimization-request';
import {f} from '../helpers/fixtures';
import {resolveFlowSpec} from '../../src/features/workspace/cloud-video-input';

it('uses the selected writing resolution when creating a video flow',()=>{
 const requested={durationSeconds:5,ratio:'9:16',resolution:'720p'};
 expect(resolveConstraints(f.promptInput({requestedSpec:requested})).resolved.requestedSpec).toEqual(requested);
 const specs=['480p','720p'].map(resolution=>({modelId:'video',durationSeconds:5,ratio:'9:16',resolution}));
 expect(resolveFlowSpec({requested,suggested:{},capability:{model:'video',videoSpecs:specs}})).toEqual({kind:'ready',spec:specs[1]});
});

it.each(['—','–','-','～','至','到'])('keeps a five second timeline with %s ranges separate from total duration',separator=>{
 const userRequest=`5秒，9:16竖屏。动作时间轴：0${separator}2秒向前；2${separator}4秒转向；4${separator}5秒停止。`;
 const resolution=resolveConstraints(f.promptInput({userRequest,requestedSpec:{durationSeconds:5,ratio:'9:16'}}));
 expect(resolution.conflicts).toEqual([]);
 expect(resolution.resolved.requestedSpec).toEqual({durationSeconds:5,ratio:'9:16'});
});
it('ignores both second labels in a timeline interval without inventing an unspecified total',()=>{
 const resolution=resolveConstraints(f.promptInput({userRequest:'动作时间轴：0秒至2秒向前；2秒至4秒转向。',requestedSpec:{}}));
 expect(resolution.readyForAI).toBe(true);expect(resolution.resolved.requestedSpec).toEqual({});
});
it('uses the current revision request for specification checks while retaining the historical prompt in the model input',()=>{
 const userRequest=JSON.stringify({任务:'针对原视频修正错误',原始提示词:'10秒，16:9横屏。',当前完整提示词:'5秒，9:16竖屏。时间轴：0—2秒向前；2—4秒转向；4—5秒停止。',本次修正要求:'修复车轮形变。'});
 const input=f.promptInput({userRequest,sceneId:'edit',requestedSpec:{durationSeconds:5,ratio:'9:16'}});
 expect(resolveConstraints(input).conflicts).toEqual([]);
 const draft={...f.draft(),...input};
 const request=JSON.parse(buildPromptOptimizationRequest(draft,'mock-text',[]));
 expect(JSON.parse(request.messages[1].content).userRequest).toBe(userRequest);
});
it('keeps the previous segment specification as context when checking a new continuation',()=>{
 const userRequest=JSON.stringify({任务:'尾帧续写',原视频提示词:'15秒，16:9横屏。',续写要求:'新增5秒，9:16竖屏。0—2秒起步；2—5秒继续向前。'});
 expect(resolveConstraints(f.promptInput({userRequest,sceneId:'extension',requestedSpec:{durationSeconds:5,ratio:'9:16'}})).readyForAI).toBe(true);
});
it('still rejects a real current specification conflict and an explicit total duration range',()=>{
 const userRequest=JSON.stringify({任务:'针对原视频修正错误',原始提示词:'5秒，9:16。',当前完整提示词:'10秒，16:9。',本次修正要求:'保留主体。'});
 expect(resolveConstraints(f.promptInput({userRequest,requestedSpec:{durationSeconds:5,ratio:'9:16'}})).conflicts.map(c=>c.field)).toEqual(['durationSeconds','ratio']);
 expect(resolveConstraints(f.promptInput({userRequest:'总时长5—10秒，9:16。',requestedSpec:{durationSeconds:5,ratio:'9:16'}})).readyForAI).toBe(false);
});
it.each(['制作一段8—10秒的视频，9:16。','视频总长8—10秒，9:16。'])('retains a real duration conflict in %s',userRequest=>{
 expect(resolveConstraints(f.promptInput({userRequest,requestedSpec:{durationSeconds:5,ratio:'9:16'}})).readyForAI).toBe(false);
});
it('rejects a timeline ending beyond the confirmed duration',()=>{
 expect(resolveConstraints(f.promptInput({userRequest:'5秒，9:16。0—2秒向前；2—4秒转向；4—8秒停止。',requestedSpec:{durationSeconds:5,ratio:'9:16'}})).readyForAI).toBe(false);
});
it.each(['。','。\n'])('accepts consecutive timeline intervals separated by %s',separator=>{
 const userRequest=`5秒，9:16。动作时间轴：\n0—2秒向前${separator}2—4秒转向${separator}4—5秒停止。`;
 expect(resolveConstraints(f.promptInput({userRequest,requestedSpec:{durationSeconds:5,ratio:'9:16'}})).conflicts).toEqual([]);
});
