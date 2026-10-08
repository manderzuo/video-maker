import {assertStrictTlsEnvironment} from './account-tls-environment.mjs';
import {spawn} from 'node:child_process';
import {readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
assertStrictTlsEnvironment();
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const certDir=path.join(root,'work/account-api-cloud/trusted-test-tls');
const key=path.join(certDir,'key.pem'),cert=path.join(certDir,'cert.pem');
if(!existsSync(key)||!existsSync(cert))throw new Error('Run the authorized local-trust PowerShell wrapper first');
let server;
try{
 server=await createServer({configFile:path.join(root,'vite.config.ts'),configLoader:'runner',root,envDir:path.join(root,'work/account-api-cloud/empty-test-env'),cacheDir:path.join(root,'work/account-api-cloud/account-vite-cache'),server:{host:'127.0.0.1',port:4180,strictPort:true,fs:{deny:['.env','.env.*','*.{crt,pem}','**/.git/**','**/work/account-api-cloud/trusted-test-tls/**']},https:{key:readFileSync(key),cert:readFileSync(cert)},proxy:{'/studio-api':{target:'http://127.0.0.1:4181',changeOrigin:false}},watch:{ignored:file=>/^(work|docs|test-results|downloads)(\/|$)/.test(path.relative(root,file).replaceAll('\\','/'))}}});
 await server.listen();process.exitCode=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['--use-system-ca',path.join(root,'node_modules/@playwright/test/cli.js'),'test','-c','playwright.account.config.ts',...process.argv.slice(2)],{cwd:root,stdio:'inherit',shell:false,windowsHide:true});child.once('error',reject);child.once('close',code=>resolve(code??1));});
}catch(error){console.error('Local account test failed:',error instanceof Error?error.message:'unknown');process.exitCode=1;}
finally{await server?.close();console.log('Local account TLS frontend closed:127.0.0.1:4180');}
