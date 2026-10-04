import {it,expect} from 'vitest';
import {f} from '../helpers/fixtures';
import {compileVideoPrompt} from '../../src/domain/prompt-engine/compile-video';
import {validatePromptResult} from '../../src/domain/prompt-engine/validate-result';
import type {PromptCompileInput,PromptCompileResult} from '../../src/domain/prompt';

const input=(originalValue:string,acceptedValue?:string):PromptCompileInput=>f.promptInput({
 userRequest:'纸飞机飞过窗边。',sceneId:'text',requestedSpec:{durationSeconds:5,ratio:'16:9'},
 lockedConstraints:[{id:'manual-person-count',field:'personCount',originalValue,locked:true,...(acceptedValue===undefined?{}:{acceptedValue})}],
});
const caps=f.caps({videoSpecs:[{modelId:'fake-video-only',durationSeconds:5,ratio:'16:9'}]});
function countIssues(compiled:PromptCompileResult,request:PromptCompileInput){
 const issues=validatePromptResult({...compiled,id:'count-result',sourceRevision:1,origin:'local',validationState:'unchecked',createdAt:1000},request,caps);
 expect(issues.filter(issue=>issue.code==='result_schema_invalid')).toEqual([]);
 return issues.filter(issue=>issue.code==='locked_personCount_changed');
}

it.each(['0','2','二'])('QA052: manually locked count %s survives local compilation and result validation',count=>{
 const request=input(count),compiled=compileVideoPrompt(request);
 expect(countIssues(compiled,request)).toEqual([]);
 expect(request.lockedConstraints[0].originalValue).toBe(count);
 expect(compiled.shotPlan).toHaveLength(1);
});
it('QA052: explicitly accepted count takes precedence without rewriting the original requirement',()=>{
 const request=input('1','2'),compiled=compileVideoPrompt(request);
 expect(countIssues(compiled,request)).toEqual([]);
 expect(request.lockedConstraints[0]).toMatchObject({originalValue:'1',acceptedValue:'2'});
});
it('QA052: an added conflicting count remains blocked even when the locked count is present',()=>{
 const request=input('0'),compiled=compileVideoPrompt(request);
 expect(countIssues({...compiled,finalPrompt:compiled.finalPrompt+'\n然后出现2位人物。'},request).map(issue=>issue.code)).toEqual(['locked_personCount_changed']);
});
