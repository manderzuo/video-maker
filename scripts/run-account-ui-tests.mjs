import {spawn} from 'node:child_process';
import {createServer as createHttpServer} from 'node:http';
import path from 'node:path';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const envDir=path.join(root,'work/account-api-cloud/task3-regression-empty-env');
let server,canary;const canaryCounts={http:0,websocket:0};
try{
 await mkdir(envDir,{recursive:true});
 server=await createServer({configFile:false,envDir,plugins:[react(),{name:'account-test-probes',configureServer(viteServer){viteServer.middlewares.use((request,response,next)=>{if(request.url==='/__account-canary-count'){response.setHeader('Content-Type','application/json');response.end(JSON.stringify(canaryCounts));}else if(request.url==='/__account-guard'){response.setHeader('Content-Type','text/html');response.end('<!doctype html><title>FAKE_NETWORK_GUARD_PROBE</title>');}else next();});}}],root,cacheDir:path.join(root,'work/account-api-cloud/account-ui-vite-cache'),server:{host:'127.0.0.1',port:4182,strictPort:true,proxy:{},fs:{deny:['.env','.env.*','**/.git/**','**/key.pem','**/*.key']},watch:{ignored:file=>/^(work|docs|test-results|downloads)(\/|$)/.test(path.relative(root,file).replaceAll('\\','/'))}}});
 canary=createHttpServer((_request,response)=>{canaryCounts.http++;response.writeHead(200,{'Content-Type':'text/plain'});response.end('FAKE_LOOPBACK_NETWORK_CANARY');});canary.on('upgrade',(_request,socket)=>{canaryCounts.websocket++;socket.destroy();});await new Promise((resolve,reject)=>{canary.once('error',reject);canary.listen(4183,'127.0.0.1',resolve);});

 await server.listen();console.log('UI-only HTTP fixture: synthetic API replies, no backend/cookie/TLS acceptance');process.exitCode=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[path.join(root,'node_modules/@playwright/test/cli.js'),'test','-c','playwright.account-ui.config.ts',...process.argv.slice(2)],{cwd:root,stdio:'inherit',shell:false,windowsHide:true});child.once('error',reject);child.once('close',code=>resolve(code??1));});
}catch(error){console.error('UI-only test failed:',error instanceof Error?error.message:'unknown');process.exitCode=1;}
finally{await server?.close();if(canary)await new Promise(resolve=>canary.close(resolve));console.log('UI-only frontend/canary closed:127.0.0.1:4182/4183');}
