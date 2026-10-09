import {expect,it,vi} from 'vitest';
import {RestrictedOutbound,normalizeModelBase,type OutboundRequest} from '../src/security/outbound.js';
const publicAddress={address:'93.184.216.34',family:4 as const};
it.each(['http://api.test','https://u:p@api.test','https://api.test?secret=x','https://api.test/#x','https://api.test?','https://api.test#','https://localhost','https://foo.localhost','https://foo.local','https://127.0.0.1','https://127.1','https://0x7f000001','https://10.0.0.1','https://169.254.169.254','https://[::1]','https://[fc00::1]','https://[::ffff:127.0.0.1]','https://api.test/v1/v1','https://api.test/foo/../admin'])('rejects unsafe base %s',base=>{expect(()=>normalizeModelBase(base)).toThrow();});
it.each(['127.0.0.1','10.0.0.1','172.16.1.1','192.168.1.1','169.254.169.254','100.64.0.1','0.0.0.0','224.0.0.1','240.0.0.1','::1','fc00::1','fe80::1','::ffff:127.0.0.1','2001:db8::1','2002:7f00:1::'])('rejects any unsafe DNS answer %s before transport',async address=>{
 const request=vi.fn();const outbound=new RestrictedOutbound({resolve:async()=>[publicAddress,{address,family:address.includes(':')?6:4}],request});
 await expect(outbound.models('text','https://api.test','FAKE_KEY')).rejects.toThrow('OUTBOUND_BLOCKED');expect(request).not.toHaveBeenCalled();
});
it('pins a verified DNS address, retains TLS host, and requests only the fixed model endpoint',async()=>{
 const resolve=vi.fn().mockResolvedValueOnce([publicAddress]).mockResolvedValue([{address:'127.0.0.1',family:4}]);const calls:OutboundRequest[]=[];
 const outbound=new RestrictedOutbound({resolve,request:async req=>{calls.push(req);return {status:200,body:Buffer.from('{"data":[]}')};}});
 await outbound.models('text','https://api.test/custom/v1','FAKE_KEY');expect(resolve).toHaveBeenCalledTimes(1);expect(calls[0]).toMatchObject({url:'https://api.test/custom/v1/models',address:publicAddress.address,family:4,maxBytes:8*1024*1024});
});
it.each([{records:[]},{records:[{address:'93.184.216.34',family:6}]},{records:[{address:'not-an-address',family:4}]}])('rejects empty or inconsistent DNS records %#',async({records})=>{
 const request=vi.fn();const outbound=new RestrictedOutbound({resolve:async()=>records,request});await expect(outbound.models('text','https://api.test','FAKE_KEY')).rejects.toThrow('OUTBOUND_BLOCKED');expect(request).not.toHaveBeenCalled();
});
it('does not follow a redirect and rejects response bodies above 8 MiB',async()=>{
 const request=vi.fn().mockResolvedValueOnce({status:302,body:Buffer.from('redirect')}).mockResolvedValueOnce({status:200,body:Buffer.alloc(8*1024*1024+1)});const outbound=new RestrictedOutbound({resolve:async()=>[publicAddress],request});
 await expect(outbound.models('text','https://api.test','FAKE_KEY')).rejects.toThrow('UPSTREAM_FAILED');expect(request).toHaveBeenCalledTimes(1);
 await expect(outbound.models('text','https://api.test','FAKE_KEY')).rejects.toThrow('UPSTREAM_TOO_LARGE');
});
it('enforces a total 15-second deadline including resolver hangs without contacting transport',async()=>{
 vi.useFakeTimers();const request=vi.fn();const outbound=new RestrictedOutbound({resolve:()=>new Promise(()=>{}),request});
 try{const result=expect(outbound.models('text','https://api.test','FAKE_KEY')).rejects.toThrow('UPSTREAM_TIMEOUT');await vi.advanceTimersByTimeAsync(15000);await result;expect(request).not.toHaveBeenCalled();}finally{vi.useRealTimers();}
});
it('aborts a hung transport at the same total deadline',async()=>{
 vi.useFakeTimers();const request=vi.fn<(input:OutboundRequest)=>Promise<{status:number;body:Buffer}>>(()=>new Promise(()=>{}));const outbound=new RestrictedOutbound({resolve:async()=>[publicAddress],request});
 try{const result=expect(outbound.models('text','https://api.test','FAKE_KEY')).rejects.toThrow('UPSTREAM_TIMEOUT');await vi.advanceTimersByTimeAsync(15000);await result;expect(request).toHaveBeenCalledTimes(1);expect(request.mock.calls[0]?.[0].signal.aborted).toBe(true);}finally{vi.useRealTimers();}
});
it('shares the deadline and validated address across video health and catalog',async()=>{
 vi.useFakeTimers();const calls:OutboundRequest[]=[];
 const request=async(input:OutboundRequest)=>{calls.push(input);if(input.url.endsWith('/healthz')){await new Promise(resolve=>setTimeout(resolve,10000));return {status:200,body:Buffer.from('{}')};}return new Promise<{status:number;body:Buffer}>(()=>{});};
 const outbound=new RestrictedOutbound({resolve:async()=>[publicAddress],request});
 try{const result=expect(outbound.models('video','https://api.test','FAKE_KEY')).rejects.toThrow('UPSTREAM_TIMEOUT');await vi.advanceTimersByTimeAsync(15000);await result;expect(calls).toHaveLength(2);expect(calls[0]?.signal).toBe(calls[1]?.signal);expect(calls[1]?.signal.aborted).toBe(true);}finally{vi.useRealTimers();}
});
it('sends completion only to the fixed TLS endpoint with pinned DNS and server supplied idempotency',async()=>{
 const calls:OutboundRequest[]=[];const outbound=new RestrictedOutbound({resolve:async()=>[publicAddress],request:async input=>{calls.push(input);return {status:200,body:Buffer.from('{}')};}});
 await outbound.completion('https://api.test/custom/v1','FAKE_KEY','{"model":"manual-model"}','task-key','task-session');
 expect(calls).toHaveLength(1);expect(calls[0]).toMatchObject({method:'POST',url:'https://api.test/custom/v1/chat/completions',address:publicAddress.address,idempotencyKey:'task-key',textSessionId:'task-session'});expect(calls[0].body?.toString()).toBe('{"model":"manual-model"}');
});
it('rejects unsafe DNS for completion and refuses redirects without exposing the upstream body',async()=>{
 const request=vi.fn().mockResolvedValue({status:302,body:Buffer.from('FAKE_PRIVATE_URL')});
 const blocked=new RestrictedOutbound({resolve:async()=>[{address:'127.0.0.1',family:4}],request});await expect(blocked.completion('https://api.test','FAKE_KEY','{}','key','session')).rejects.toThrow('OUTBOUND_BLOCKED');expect(request).not.toHaveBeenCalled();
 const outbound=new RestrictedOutbound({resolve:async()=>[publicAddress],request});await expect(outbound.completion('https://api.test','FAKE_KEY','{}','key','session')).rejects.toThrow('UPSTREAM_FAILED');expect(request).toHaveBeenCalledTimes(1);
});
it('uses allowlisted video paths and refuses unsafe task identities before transport',async()=>{
 const calls:OutboundRequest[]=[];const outbound=new RestrictedOutbound({resolve:async()=>[publicAddress],request:async input=>{calls.push(input);return {status:200,body:Buffer.from('{}')};}});
 await outbound.video('https://api.test','FAKE_KEY',{kind:'submit',body:'{}',idempotencyKey:'run-id'});await outbound.video('https://api.test','FAKE_KEY',{kind:'query',taskId:'task_1'});await outbound.video('https://api.test','FAKE_KEY',{kind:'content',taskId:'task_1'},1024);
 expect(calls.map(call=>call.url)).toEqual(['https://api.test/v1/videos/generations','https://api.test/v1/videos/task_1','https://api.test/v1/videos/task_1/content']);expect(calls[0]).toMatchObject({method:'POST',idempotencyKey:'run-id'});expect(calls[2].maxBytes).toBe(1024);
 for(const taskId of ['..','.','../private','https://other.test','task%2fprivate','task?secret'])await expect(outbound.video('https://api.test','FAKE_KEY',{kind:'content',taskId})).rejects.toThrow('INVALID_REQUEST');expect(calls).toHaveLength(3);
});
