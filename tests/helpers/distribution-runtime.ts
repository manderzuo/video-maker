import {request as httpRequest,type Server} from 'node:http';
import {spawn,type ChildProcess} from 'node:child_process';
export async function listenLocal(server:Server):Promise<string>{await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});const address=server.address();if(!address||typeof address==='string')throw Error('native_loopback_listener_missing');return 'http://127.0.0.1:'+address.port;}
export async function closeLocal(server:Server){server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
export async function rawLocalRequest(origin:string,path:string,options:{method?:string;headers?:Record<string,string>;body?:string}={}){
 const url=new URL(origin);if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!url.port)throw Error('only_owned_loopback_fixture_allowed');
 return new Promise<{status:number;headers:Record<string,string|string[]|undefined>;body:string}>((resolve,reject)=>{const req=httpRequest({hostname:'127.0.0.1',port:url.port,path,method:options.method??'GET',headers:options.headers},response=>{const chunks:Buffer[]=[];response.on('data',chunk=>chunks.push(chunk));response.on('end',()=>resolve({status:response.statusCode??0,headers:response.headers,body:Buffer.concat(chunks).toString('utf8')}));response.on('error',reject);});req.on('error',reject);req.setTimeout(5000,()=>req.destroy(Error('owned_loopback_fixture_timeout')));req.end(options.body);});
}
export function startOwnedNode(script:string,args:string[],cwd:string,extraEnv:Record<string,string>={}){
 const child=spawn(process.execPath,[script,...args],{cwd,env:{SystemRoot:process.env.SystemRoot,TEMP:cwd,TMP:cwd,...extraEnv},stdio:['pipe','pipe','pipe'],windowsHide:true});
 return child;
}
export function startupLine(child:ChildProcess,pattern:RegExp):Promise<string>{return new Promise((resolve,reject)=>{let text='';const timer=setTimeout(()=>reject(Error('owned_process_startup_timeout')),5000);child.stdout?.on('data',chunk=>{text+=chunk.toString();const match=text.match(pattern);if(match){clearTimeout(timer);resolve(match[0]);}});child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',()=>{clearTimeout(timer);reject(Error('owned_process_exited_before_startup'));});});}
export async function stopOwnedNode(child:ChildProcess){if(child.exitCode!==null)return;await new Promise<void>(resolve=>{child.once('exit',()=>resolve());child.kill();});}
