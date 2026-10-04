import {it,expect} from 'vitest';
import {parsePromptResponse} from '../../src/adapters/core/prompt-result-parser';
import {f} from '../helpers/fixtures';
it('T31-C01: exact structured JSON produces a typed candidate without inventing fields',()=>{const result=f.promptResult();expect(parsePromptResponse(JSON.stringify(result))).toMatchObject({status:'parsed',format:'json',result});});
it('T31-C02: frozen-source FINAL_PROMPT/IMPROVEMENTS/PARAMETERS sections stay compatible but need review',()=>{const parsed=parsePromptResponse('[FINAL_PROMPT]\n原始品牌康济健葆\n[IMPROVEMENTS]\n改善运镜\n[PARAMETERS]\n时长5秒');expect(parsed.status).toBe('needs_review');expect(parsed.result?.finalPrompt).toBe('原始品牌康济健葆');expect(parsed.result?.improvements).toContain('改善运镜');expect(parsed.result?.warnings.join(' ')).toContain('时长5秒');});
it('T31-C03: malformed JSON retains raw text and does not silently call it a valid result',()=>{const raw='{bad <img src=x onerror=alert(1)>',parsed=parsePromptResponse(raw);expect(parsed).toMatchObject({status:'invalid',raw});expect(parsed.result).toBeUndefined();});
it('T31: unknown command fields and duplicate legacy markers are rejected as candidate protocol errors',()=>{expect(parsePromptResponse(JSON.stringify({...f.promptResult(),commands:[{type:'run_video'}]})).status).toBe('invalid');expect(parsePromptResponse('[FINAL_PROMPT]a[FINAL_PROMPT]b[IMPROVEMENTS]c[PARAMETERS]d').status).toBe('invalid');});
it('QA07: a real-world creative suggestedSpec shape is retained as a review-only candidate without executable extra fields',()=>{
 const reply={...f.promptResult({finalPrompt:'原创短片候选',shotPlan:[{id:'shot-1',durationSeconds:5,prompt:'骑行',startState:'出发',endState:'停下'}]}),suggestedSpec:{durationSeconds:5,aspectRatio:'9:16',audio:'ambient',frameRate:24,motionIntensity:'low',resolution:'480p',shotCount:1,style:'cinematic'}};
 const parsed=parsePromptResponse(JSON.stringify(reply));
 expect(parsed.status).toBe('needs_review');expect(parsed.format).toBe('json');expect(parsed.result?.finalPrompt).toBe('原创短片候选');expect(parsed.result?.shotPlan).toHaveLength(1);expect(parsed.result?.suggestedSpec).toEqual({durationSeconds:5});expect(parsed.issues).toEqual(expect.arrayContaining([expect.objectContaining({code:'prompt_spec_extra_fields',path:'suggestedSpec'})]));expect(parsed.raw).toContain('aspectRatio');
 expect(parsePromptResponse(JSON.stringify({...reply,suggestedSpec:{...reply.suggestedSpec,commands:[{type:'run_video'}]}})).status).toBe('invalid');
});
