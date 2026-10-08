import {spawn} from 'node:child_process';
import path from 'node:path';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const envDir=path.join(root,'work/account-api-cloud/task3-empty-env');let server;
try{
 await mkdir(envDir,{recursive:true});server=await createServer({configFile:false,envDir,plugins:[react()],root,cacheDir:path.join(root,'work/account-api-cloud/task3-vite-cache'),server:{host:'127.0.0.1',port:4310,strictPort:true,proxy:{},fs:{deny:['.env','.env.*','**/.git/**','**/key.pem','**/*.key']},watch:{ignored:file=>/^(work|docs|test-results|downloads)(\/|$)/.test(path.relative(root,file).replaceAll('\\','/'))}}});
 await server.listen();console.log('Task3 UI-only HTTP loopback: mocked API, no real upstream or trusted TLS acceptance');
 process.exitCode=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[path.join(root,'node_modules/@playwright/test/cli.js'),'test','-c','playwright.account-api-ui.config.ts',...process.argv.slice(2)],{cwd:root,stdio:'inherit',shell:false,windowsHide:true});child.once('error',reject);child.once('close',code=>resolve(code??1));});
}catch(error){console.error('Task3 UI fixture failed:',error instanceof Error?error.message:'unknown');process.exitCode=1;}
finally{await server?.close();console.log('Task3 UI frontend closed:127.0.0.1:4310');}
