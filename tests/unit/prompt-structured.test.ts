import {expect,it} from 'vitest';
import {strictJson,completionContent,promptResultObject} from '../../src/domain/prompt-engine/structured-result';

it('preserves dialogue quotes, escapes, newlines, Chinese and emoji',()=>{
 const source={finalPrompt:'他说："开门。"\n路径 C:\\temp，🧭',nested:[{value:'\\n 不转换成剧情'}]};
 expect(strictJson(JSON.stringify(source))).toEqual(source);expect(promptResultObject('```json\n'+JSON.stringify(source)+'\n```')).toEqual(source);
});
it.each(['{"a":1,"a":2}','{"a":1,"\\u0061":2}','{"nested":{"a":1,"a":2}}'])('rejects decoded duplicate keys: %s',source=>{expect(()=>strictJson(source)).toThrow('JSON_DUPLICATE_KEY');});
it.each(['{"a":"bad\\q"}','{"a":1,}','{} {}','{"x":1e999}'])('rejects malformed or non-finite JSON: %s',source=>{expect(()=>strictJson(source)).toThrow();});
it('rejects truncated output even when the JSON happens to parse',()=>{expect(()=>completionContent({choices:[{finish_reason:'length',message:{content:'{}'}}]})).toThrow('UPSTREAM_OUTPUT_TRUNCATED');});
it('accepts an empty legacy tool list with a normal stop',()=>{expect(completionContent({choices:[{finish_reason:'stop',message:{content:'{}',tool_calls:[]}}]})).toBe('{}');});
it('accepts whitespace alongside exactly the selected structured tool',()=>{
 expect(completionContent({choices:[{finish_reason:'tool_calls',message:{content:'\n ',tool_calls:[{type:'function',function:{name:'submit_prompt_optimization',arguments:'{}'}}]}}]})).toBe('{}');
});
