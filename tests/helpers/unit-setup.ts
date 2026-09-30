import {beforeEach,afterEach,expect} from 'vitest';
import {isAllowedTestUrl} from './network-policy.mjs';
const originalFetch=globalThis.fetch;
let forbidden:string[]=[];
beforeEach(()=>{
 forbidden=[];
 globalThis.fetch=async(input,init)=>{
  const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
  if(!isAllowedTestUrl(url,'http://127.0.0.1:4179')){forbidden.push(url);throw new Error('test_network_denied');}
  return originalFetch(input,init);
 };
});
afterEach(()=>{globalThis.fetch=originalFetch;expect(forbidden,'unit test attempted unauthorized network').toEqual([]);});
