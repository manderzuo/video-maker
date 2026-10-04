import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {createLocalServer} from './serve-local.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const rawArgs=process.argv.slice(2),staticMode=rawArgs.includes('--studio-static'),args=rawArgs.filter(value=>value!=='--studio-static');
let closeServer;
try{
 if(!args.some(value=>['--list','--help','--version','-h','-V'].includes(value))){
  if(staticMode){
   const server=createLocalServer({root:process.env.STUDIO_TEST_DIST??path.join(root,'dist')});
   await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(4179,'127.0.0.1',resolve);});
   closeServer=()=>new Promise((resolve,reject)=>{server.closeAllConnections();server.close(error=>error?reject(error):resolve());});
  }else{
   const server=await createServer({configFile:path.join(root,'vite.config.ts'),configLoader:'runner',root,cacheDir:process.env.STUDIO_TEST_CACHE_DIR??path.join(root,'work','playwright-vite-cache'),server:{host:'127.0.0.1',port:4179,strictPort:true,watch:{ignored:file=>{
    const relative=path.relative(root,file).replaceAll('\\','/');
    return /^(?:work|downloads|test-results|playwright-report)(?:\/|$)/.test(relative)||/^docs\/review(?:\/|$)/.test(relative);
   }}}});
   closeServer=()=>server.close();await server.listen();
  }
 }
 const code=await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[path.join(root,'node_modules/@playwright/test/cli.js'),...args],{cwd:root,stdio:'inherit',shell:false,windowsHide:true,env:{...process.env,STUDIO_MANAGED_TEST_SERVER:'1'}});
  child.once('error',reject);child.once('close',(exitCode,signal)=>resolve(signal?1:exitCode??1));
 });
 process.exitCode=code;
}catch(error){console.error('Studio browser test runner failed:',error instanceof Error?error.message:'unknown error');process.exitCode=1;}
finally{if(closeServer){try{await closeServer();console.log('Studio test server closed: 127.0.0.1:4179');}catch(error){console.error('Studio test server close failed:',error instanceof Error?error.message:'unknown error');process.exitCode=1;}}}
