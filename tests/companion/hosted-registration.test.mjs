import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalServer} from '../../scripts/serve-local.mjs';

test('hosted deployment only registers explicitly allowed service targets', async () => {
 const server=createLocalServer({allowedRegistrationTargets:[
  {kind:'core',name:'Core',origin:'https://core.example.invalid'},
  {kind:'text',name:'Text',origin:'https://text.example.invalid/zen/go/v1'},
 ]});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 try {
  const {nonce}=await (await fetch(origin+'/studio-session.json',{headers:{'X-Studio-Settings':'1'}})).json();
  const register=(kind,target)=>fetch(origin+'/studio-api/connections',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Studio-Session':nonce},body:JSON.stringify({kind,name:'User label',origin:target})});
  assert.equal((await register('core','https://core.example.invalid')).status,201);
  assert.equal((await register('text','https://text.example.invalid/zen/go/v1/chat/completions')).status,201);
  for(const target of ['http://127.0.0.1:22','https://unapproved.example.invalid','https://text.example.invalid/other']) {
   assert.equal((await register('text',target)).status,403,target);
  }
  assert.equal((await register('text','https://core.example.invalid')).status,403);
  const deployment=await (await fetch(origin+'/studio-deployment.json')).json();
  assert.equal(deployment.connections.length,2);
 } finally { await new Promise(resolve=>server.close(resolve)); }
});

test('an empty hosted allowlist denies all registration and malformed configuration fails closed', async()=>{
 assert.throws(()=>createLocalServer({allowedRegistrationTargets:'invalid'}));
 const server=createLocalServer({allowedRegistrationTargets:[]});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 try {
  const {nonce}=await (await fetch(origin+'/studio-session.json',{headers:{'X-Studio-Settings':'1'}})).json();
  const response=await fetch(origin+'/studio-api/connections',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Studio-Session':nonce},body:JSON.stringify({kind:'text',name:'Text',origin:'https://text.example.invalid'})});
  assert.equal(response.status,403);
 } finally { await new Promise(resolve=>server.close(resolve)); }
});
