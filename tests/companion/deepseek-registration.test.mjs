import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createLocalServer} from '../../scripts/serve-local.mjs';
const listen=async server=>{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return 'http://127.0.0.1:'+server.address().port;};
const close=async server=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));};
async function register(origin,address){const {nonce}=await(await fetch(origin+'/studio-session.json',{headers:{'X-Studio-Settings':'1'}})).json();const response=await fetch(origin+'/studio-api/connections',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Studio-Session':nonce},body:JSON.stringify({kind:'text',name:'DeepSeek local QA',origin:address})});assert.equal(response.status,201);return(await response.json()).profile;}
test('base and full Chat endpoint register the same target and request the correct prefixed models path',async()=>{
 const paths=[],mock=createServer((req,res)=>{paths.push(req.url);res.setHeader('Content-Type','application/json');if(req.url!=='/zen/go/v1/models')res.statusCode=404;res.end(JSON.stringify({data:[{id:'deepseek-v4.1-flash'}]}));}),target=await listen(mock),server=createLocalServer(),origin=await listen(server);
 try{const full=await register(origin,target+'/zen/go/v1/chat/completions'),base=await register(origin,target+'/zen/go/v1/');assert.deepEqual(paths,[]);assert.equal(full.originSnapshot,target+'/zen/go');assert.equal(full.id,base.id);assert.equal((await fetch(origin+full.proxyBase+'/v1/models')).status,200);assert.deepEqual(paths,['/zen/go/v1/models']);}finally{await close(server);await close(mock);}
});
test('text proxy forwards validated session and its own application identity but drops cookies',async()=>{
 let captured;const mock=createServer((req,res)=>{captured={path:req.url,session:req.headers['x-opencode-session'],userAgent:req.headers['user-agent'],cookie:req.headers.cookie};res.setHeader('Content-Type','application/json');res.end('{}');}),target=await listen(mock),server=createLocalServer(),origin=await listen(server);
 try{const profile=await register(origin,target+'/zen/go/v1');const response=await fetch(origin+profile.proxyBase+'/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':'qa-one','X-OpenCode-Session':'qa-stable-session',Authorization:'Bearer fake-test-key',Cookie:'fake-private-cookie','User-Agent':'untrusted-caller'},body:'{"model":"deepseek-v4.1-flash","messages":[],"stream":false}'});assert.equal(response.status,200);assert.equal(captured.path,'/zen/go/v1/chat/completions');assert.equal(captured.session,'qa-stable-session');assert.equal(captured.userAgent,'AIWorkStudio/0.0.1');assert.equal(captured.cookie,undefined);assert.equal((await fetch(origin+profile.proxyBase+'/v1/responses',{method:'POST',body:'{}'})).status,403);}finally{await close(server);await close(mock);}
});
test('malformed conversation metadata cannot reach a registered upstream',async()=>{
 let calls=0;const mock=createServer((_req,res)=>{calls++;res.end('{}');}),target=await listen(mock),server=createLocalServer(),origin=await listen(server);
 try{const profile=await register(origin,target+'/v1');const response=await fetch(origin+profile.proxyBase+'/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':'qa-one','X-OpenCode-Session':'unsafe space'},body:'{}'});assert.equal(response.status,400);assert.equal((await response.json()).error.code,'text_session_invalid');assert.equal(calls,0);}finally{await close(server);await close(mock);}
});
