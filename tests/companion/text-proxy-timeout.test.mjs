import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createLocalServer} from '../../scripts/serve-local.mjs';

const listen=async server=>{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return 'http://127.0.0.1:'+server.address().port;};
const close=async server=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));};
async function register(origin,target){
 const {nonce}=await(await fetch(origin+'/studio-session.json',{headers:{'X-Studio-Settings':'1'}})).json();
 const reply=await fetch(origin+'/studio-api/connections',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Studio-Session':nonce},body:JSON.stringify({kind:'text',name:'Owned slow text fixture',origin:target})});
 assert.equal(reply.status,201);return(await reply.json()).profile;
}
const headers={'Content-Type':'application/json','Idempotency-Key':'same-frozen-slow-text-key','X-OpenCode-Session':'same-text-session',Authorization:'Bearer fake-only-key',Cookie:'must-not-forward'};
const body='{"model":"local-slow-text","stream":false,"messages":[{"role":"user","content":"owned fixture"}]}';

test('a non-stream text response after 31 seconds reaches the caller once with frozen identity and no cookie', {timeout:45000},async()=>{
 const calls=[];let timer;
 const mock=createServer(async(req,res)=>{let received='';for await(const part of req)received+=part;calls.push({body:received,key:req.headers['idempotency-key'],session:req.headers['x-opencode-session'],cookie:req.headers.cookie});timer=setTimeout(()=>{res.setHeader('Content-Type','application/json');res.end('{"choices":[{"message":{"content":"slow-success"}}]}');},31000);});
 const target=await listen(mock),server=createLocalServer(),origin=await listen(server);
 try{const profile=await register(origin,target);const reply=await fetch(origin+profile.proxyBase+'/v1/chat/completions',{method:'POST',headers,body});assert.equal(reply.status,200);assert.equal((await reply.json()).choices[0].message.content,'slow-success');assert.deepEqual(calls,[{body,key:headers['Idempotency-Key'],session:headers['X-OpenCode-Session'],cookie:undefined}]);}
 finally{clearTimeout(timer);await close(server);await close(mock);}
});

test('stopping the caller closes its in-flight upstream without retrying', {timeout:5000},async()=>{
 let calls=0,started;const began=new Promise(resolve=>{started=resolve;});let closed;const ended=new Promise(resolve=>{closed=resolve;});
 const mock=createServer(async(req,res)=>{let received='';for await(const part of req)received+=part;assert.equal(received,body);calls++;res.on('close',closed);started();});
 const target=await listen(mock),server=createLocalServer(),origin=await listen(server),controller=new AbortController();
 try{const profile=await register(origin,target);const pending=fetch(origin+profile.proxyBase+'/v1/chat/completions',{method:'POST',headers,body,signal:controller.signal});const rejected=assert.rejects(pending,{name:'AbortError'});await began;controller.abort();await rejected;await ended;assert.equal(calls,1);}
 finally{controller.abort();await close(server);await close(mock);}
});
