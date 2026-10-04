import {describe,expect,it} from 'vitest';
import {normalizeTextApiBase,resolveTextModelId,sameTextApiBase} from '../../src/adapters/text/provider-profile';

describe('independent text provider profile',()=>{
 it.each([
  'https://opencode.ai/zen/go',
  'https://opencode.ai/zen/go/v1',
  'https://opencode.ai/zen/go/v1/',
  'https://opencode.ai/zen/go/v1/chat/completions',
 ])('normalizes %s to the same OpenCode Go base',input=>{
  expect(normalizeTextApiBase(input)).toEqual({ok:true,value:'https://opencode.ai/zen/go'});
  expect(sameTextApiBase(input,'https://opencode.ai/zen/go')).toBe(true);
 });
 it.each([
  'https://name:secret@opencode.ai/zen/go',
  'https://opencode.ai/zen/go?token=secret',
  'https://opencode.ai/zen/go/../admin',
  'https://opencode.ai/zen/go/v1/v1',
 ])('rejects unsafe address %s',input=>{
  expect(normalizeTextApiBase(input).ok).toBe(false);
 });
 it('maps only the OpenCode config prefix to its direct HTTP catalog ID',()=>{
  const catalog=['deepseek-v4.1-flash'];
  expect(resolveTextModelId('https://opencode.ai/zen/go','opencode-go/deepseek-v4.1-flash',catalog)).toEqual({ok:true,value:'deepseek-v4.1-flash'});
  expect(resolveTextModelId('https://opencode.ai/zen/go','deepseek-v4.1-flash',catalog)).toEqual({ok:true,value:'deepseek-v4.1-flash'});
  expect(resolveTextModelId('https://opencode.ai/zen/go','openai/deepseek-v4.1-flash',catalog).ok).toBe(false);
  expect(resolveTextModelId('https://opencode.ai/zen/go','opencode-go/not-in-catalog',catalog).ok).toBe(false);
 });
 it('preserves slash-containing model IDs for other providers',()=>{
  expect(resolveTextModelId('https://example.org/custom','vendor/model',['vendor/model'])).toEqual({ok:true,value:'vendor/model'});
 });
});
