import {EventEmitter} from 'node:events';
import type {RequestOptions} from 'node:https';
import {beforeEach,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({request:vi.fn(),status:200,body:Buffer.from('{"data":[]}'),destroy:vi.fn()}));
vi.mock('node:https',()=>({request:mock.request}));
import {nativeHttpsRequest,RestrictedOutbound} from '../src/security/outbound.js';
beforeEach(()=>{
 mock.status=200;mock.body=Buffer.from('{"data":[]}');mock.destroy.mockReset();
 mock.request.mockImplementation((_url:URL,_options:RequestOptions,callback:(response:EventEmitter)=>void)=>{
  const response=Object.assign(new EventEmitter(),{statusCode:mock.status,destroy:mock.destroy});
  const request=Object.assign(new EventEmitter(),{end:()=>{callback(response);queueMicrotask(()=>{response.emit('data',mock.body);response.emit('end');});}});
  return request;
 });
});
it.each([{address:'93.184.216.34',family:4},{address:'2606:4700:4700::1111',family:6}])('uses the exact validated address and verifies the original TLS hostname for IPv$family',async pinned=>{
 const outbound=new RestrictedOutbound({resolve:async()=>[pinned],request:nativeHttpsRequest});
 const result=await outbound.models('text','https://api.example.test/v1','FAKE_NATIVE_KEY');expect(result.status).toBe(200);
 const [url,options]=mock.request.mock.calls[0] as [URL,RequestOptions];
 expect(url.href).toBe('https://api.example.test/v1/models');expect(options).toMatchObject({method:'GET',agent:false,rejectUnauthorized:true,servername:'api.example.test',headers:{Accept:'application/json',Authorization:'Bearer FAKE_NATIVE_KEY'}});
 expect(options.signal).toBeInstanceOf(AbortSignal);expect(options.signal?.aborted).toBe(false);
 const single=vi.fn(),all=vi.fn();options.lookup!('api.example.test',{all:false},single);options.lookup!('api.example.test',{all:true},all);
 expect(single).toHaveBeenCalledWith(null,pinned.address,pinned.family);expect(all).toHaveBeenCalledWith(null,[pinned]);expect(mock.request).toHaveBeenCalledTimes(1);
});
it('destroys redirect response without a second request',async()=>{
 mock.status=302;const outbound=new RestrictedOutbound({resolve:async()=>[{address:'93.184.216.34',family:4}],request:nativeHttpsRequest});
 await expect(outbound.models('text','https://api.example.test','FAKE_NATIVE_KEY')).rejects.toThrow('UPSTREAM_FAILED');expect(mock.request).toHaveBeenCalledTimes(1);expect(mock.destroy).toHaveBeenCalledTimes(1);
});
it('destroys oversized native response at the exact byte bound',async()=>{
 mock.body=Buffer.alloc(8*1024*1024+1);const outbound=new RestrictedOutbound({resolve:async()=>[{address:'93.184.216.34',family:4}],request:nativeHttpsRequest});
 await expect(outbound.models('text','https://api.example.test','FAKE_NATIVE_KEY')).rejects.toThrow('UPSTREAM_TOO_LARGE');expect(mock.destroy).toHaveBeenCalledTimes(1);
});
