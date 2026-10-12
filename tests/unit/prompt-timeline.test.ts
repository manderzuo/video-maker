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
it('accepts independent appearance timing in a video revision without changing its total duration',()=>{
 const prompt='5秒，9:16竖屏。动作时间轴：0—2秒向前；2—4秒转向；4—5秒停止。';
 const userRequest=JSON.stringify({任务:'针对原视频修正错误',当前完整提示词:prompt,本次修正要求:'猴子在对向车道过来，大概第二秒才进入画面。熊猫坐在路边，大概在3-4秒左右出现。'});
 const resolution=resolveConstraints(f.promptInput({userRequest,sceneId:'edit',requestedSpec:{durationSeconds:5,ratio:'9:16'}}));
 expect(resolution.conflicts).toEqual([]);expect(resolution.resolved.userRequest).toBe(userRequest);
});
it.each(['大概在3-4秒左右出现。','第2秒进入画面。','在2秒时进入画面。','3—4秒左右出现。','在第2秒进入画面。'])('keeps an event time separate from total duration: %s',timing=>{
 const resolution=resolveConstraints(f.promptInput({userRequest:'5秒，9:16。'+timing,requestedSpec:{durationSeconds:5,ratio:'9:16'}}));
 expect(resolution.conflicts).toEqual([]);expect(resolution.resolved.requestedSpec.durationSeconds).toBe(5);
 const unspecified=resolveConstraints(f.promptInput({userRequest:timing,requestedSpec:{}}));
 expect(unspecified.readyForAI).toBe(true);expect(unspecified.resolved.requestedSpec).toEqual({});
});
it.each(['大概在3-8秒左右出现。','第8秒进入画面。','在8秒时进入画面。'])('rejects an event time beyond the confirmed duration: %s',timing=>{
 const resolution=resolveConstraints(f.promptInput({userRequest:'5秒，9:16。'+timing,requestedSpec:{durationSeconds:5,ratio:'9:16'}}));
 expect(resolution.conflicts).toContainEqual({field:'durationSeconds',originalValue:'时间轴终点 8 秒',formValue:'5'});
});
it.each(['动作持续3-4秒。','总时长为3-4秒。','视频长度约4秒。','画面在雨中持续4秒。','总时长大约为0—2秒。','画面持续3-4秒出现变化。'])('still checks a duration requirement: %s',timing=>{
 expect(resolveConstraints(f.promptInput({userRequest:timing,requestedSpec:{durationSeconds:5}})).readyForAI).toBe(false);
});
it('does not let an appearance range start a timeline chain that hides a later duration requirement',()=>{
 const resolution=resolveConstraints(f.promptInput({userRequest:'主体在1—2秒左右出现。制作一段2—4秒的视频，9:16。',requestedSpec:{durationSeconds:5,ratio:'9:16'}}));
 expect(resolution.readyForAI).toBe(false);
 expect(resolution.conflicts).toContainEqual({field:'durationSeconds',originalValue:'4',formValue:'5'});
});
it('accepts correction timing written after the appearance action',()=>{
 const prompt='5秒，9:16竖屏。动作时间轴：0—2秒向前；2—4秒转向；4—5秒停止。';
 const userRequest=JSON.stringify({任务:'针对原视频修正错误',当前完整提示词:prompt,本次修正要求:'主体沿对向车道过来，出现在1-2秒。注意车轮与行驶方向。另一主体坐在路边，出现在3-4秒。'});
 const input=f.promptInput({userRequest,sceneId:'edit',requestedSpec:{durationSeconds:5,ratio:'9:16',resolution:'480p'}});
 const resolution=resolveConstraints(input);expect(resolution.conflicts).toEqual([]);expect(resolution.resolved.requestedSpec).toEqual(input.requestedSpec);
 const request=JSON.parse(buildPromptOptimizationRequest({...f.draft(),...input},'mock-text',[]));expect(JSON.parse(request.messages[1].content).userRequest).toBe(userRequest);
});
it.each(['出现在1-2秒。','大概出现在3—4秒。','入画时间为1至2秒。','出场时间：3到4秒。','进入画面时间是2秒。','出现在第2秒。','在3-4秒之间出现。','在3-4秒期间出现。'])('recognizes an event time in either word order: %s',timing=>{
 const resolution=resolveConstraints(f.promptInput({userRequest:'5秒，9:16。'+timing,requestedSpec:{durationSeconds:5,ratio:'9:16'}}));
 expect(resolution.conflicts).toEqual([]);
 const unspecified=resolveConstraints(f.promptInput({userRequest:timing,requestedSpec:{}}));expect(unspecified.readyForAI).toBe(true);expect(unspecified.resolved.requestedSpec).toEqual({});
});
it.each(['出现在3-8秒。','入画时间为8秒。','出场时间：7秒。'])('rejects appearance timing beyond the chosen duration: %s',timing=>{
 const resolution=resolveConstraints(f.promptInput({userRequest:timing,requestedSpec:{durationSeconds:5}}));expect(resolution.readyForAI).toBe(false);expect(resolution.conflicts[0].originalValue).toMatch(/^时间轴终点 [78] 秒$/);
});
it.each(['主体出现时长为3-4秒。','主体出现持续时间为3-4秒。','入画后视频总时长为3-4秒。','主体出现在1—2秒。制作一段2—4秒的视频。','角色出现在1-2秒的视频中。','主体出现在0—2秒。制作一段2—4秒的视频。','角色出现在3-4秒长的视频中。','角色出现在3秒长的短片中。','角色出现在3-4秒长片段中。'])('retains duration conflicts near appearance wording: %s',timing=>{
 expect(resolveConstraints(f.promptInput({userRequest:timing,requestedSpec:{durationSeconds:5}})).readyForAI).toBe(false);
});

it.each(['0.8 秒起声音进入。','4.8 秒句尾气息变弱。','9.8 秒处有一次叹息。','14.5 秒后只剩环境音。','5.3 秒前保持安静。','第10.6秒起播放旁白。','4.8秒末结束这一句。'])('recognizes narrated event timestamps without treating them as duration: %s',timing=>{
 const input=f.promptInput({userRequest:'总时长15秒，9:16。'+timing,requestedSpec:{durationSeconds:15,ratio:'9:16'}});
 expect(resolveConstraints(input).conflicts).toEqual([]);
 const unspecified=resolveConstraints(f.promptInput({userRequest:timing,requestedSpec:{}}));
 expect(unspecified.readyForAI).toBe(true);expect(unspecified.resolved.requestedSpec).toEqual({});
});
it('retains a revision envelope containing shot intervals and decimal voice-over cues',()=>{
 const prompt='9:16竖屏，总时长15秒。【时间轴】0–5秒：中景；0.8秒起OS进入，4.8秒句尾气息变弱。5–10秒：特写；5.3秒起旁白继续，9.8秒处有一次短促叹息。10–15秒：近景；10.6秒起声音更轻，14.5秒后只剩环境音。';
 const userRequest=JSON.stringify({任务:'针对原视频修正错误',原始提示词:prompt,当前完整提示词:prompt,本次修正要求:'修复服装时有时无，保持服装一致性。',保留要求:'保留未修改的台词和时间轴。'});
 const input=f.promptInput({userRequest,sceneId:'edit',requestedSpec:{durationSeconds:15,ratio:'9:16',resolution:'480p'}});
 expect(resolveConstraints(input).readyForAI).toBe(true);
 const body=JSON.parse(buildPromptOptimizationRequest({...f.draft(),...input},'mock-text',[]));
 expect(JSON.parse(body.messages[1].content).userRequest).toBe(userRequest);
 expect(JSON.parse(body.messages[1].content).requestedSpec).toEqual(input.requestedSpec);
});
it.each(['15.8秒起声音进入。','16秒处叹息。','16秒后只剩环境音。','16秒前保持安静。','16秒句尾气息变弱。'])('still rejects an out-of-bounds narrated timestamp: %s',timing=>{
 const resolution=resolveConstraints(f.promptInput({userRequest:timing,requestedSpec:{durationSeconds:15}}));
 expect(resolution.conflicts).toContainEqual({field:'durationSeconds',originalValue:'时间轴终点 '+(/15\.8/.test(timing)?'15.8':'16')+' 秒',formValue:'15'});
});
it.each(['旁白持续4.8秒后结束。','镜头总时长为4.8秒后进入下一段。','制作一个4.8秒长的视频。','0–5秒：建立场景。旁白持续4.8秒后结束。','4.8秒的片段末尾叹息。','总时长从4.8秒起。'])('keeps actual length requirements near timestamp cues: %s',userRequest=>{
 const resolution=resolveConstraints(f.promptInput({userRequest,requestedSpec:{durationSeconds:15}}));
 expect(resolution.conflicts).toContainEqual({field:'durationSeconds',originalValue:'4.8',formValue:'15'});
});
