import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {registerTestMockOrigin} from '../helpers/mock-network';
import accepted from '../fixtures/core-v2/video-accepted.json';
import completed from '../fixtures/core-v2/video-completed.json';
export type MockRequest={method:string;path:string;credentialPresent:boolean;idempotencyKey?:string;body?:unknown};
export type MockFaults={loseAssetResponse?:boolean;malformedAsset?:boolean;loseSubmitResponse?:boolean;loseChatResponse?:boolean;chatDelayMs?:number;chatContent?:string;statusErrorOnce?:number;statusRetryAfter?:string;submitError?:{status:number;code:string};contentRedirect?:string;queryStatus?:string;malformedTask?:boolean;workResponse?:unknown;streamContent?:boolean};
export async function startMockCore(options:{contentBytes?:Uint8Array}={}){
 const requests:MockRequest[]=[],faults:MockFaults={},tasks=new Map<string,{fingerprint:string;taskId:string}>(),taskOwners=new Map<string,string>();let counter=0;
 const server=createServer(async(req,res)=>{
  const path=req.url??'',method=req.method??'',credential=req.headers.authorization??'',identity=createHash('sha256').update(credential).digest('hex'),key=typeof req.headers['idempotency-key']==='string'?req.headers['idempotency-key']:undefined;
  const record:MockRequest={method,path,credentialPresent:!!credential,...(key?{idempotencyKey:key}:{})};requests.push(record);
  const json=(status:number,value:unknown)=>{res.writeHead(status,{'Content-Type':'application/json','X-Studio-Mock':'true'});res.end(JSON.stringify(value));};
  if(!/^Bearer fake-[\w-]+$/.test(credential)){json(401,{error:{code:'mock_fake_key_required'}});return;}
  try{
   if(method==='GET'&&path==='/v1/models'){json(200,{object:'list',data:[{id:'fake-text-only',object:'model'},{id:'fake-video-only',object:'model'}]});return;}
   if(method==='POST'){
    let body='';for await(const chunk of req){body+=chunk.toString();if(Buffer.byteLength(body)>(path==='/v1/assets'?46:8)*1024*1024){json(413,{error:{code:'request_too_large'}});return;}}
    const value=JSON.parse(body) as Record<string,unknown>;record.body=value;
    if(path==='/v1/assets'){
     const bytes=Buffer.from(String(value.data_base64??''),'base64');if(!bytes.length){json(400,{error:{code:'asset_empty'}});return;}
     const now=Math.floor(Date.now()/1000),asset={object:'asset',id:'mock-asset-'+(++counter),filename:value.filename,mime_type:value.mime_type,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),created_at:now,expires_at:now+1800,content_url:'https://not-followed.invalid/temp-secret'};
     if(faults.loseAssetResponse){faults.loseAssetResponse=false;req.socket.destroy();return;}
     json(200,faults.malformedAsset?{...asset,sha256:'0'.repeat(64)}:asset);return;
    }
    if(path==='/v1/videos/generations'){
     if(faults.submitError){json(faults.submitError.status,{error:{code:faults.submitError.code}});return;}
     if(!key){json(400,{error:{code:'mock_idempotency_required'}});return;}
     const boundKey=identity+':'+key,prior=tasks.get(boundKey),fingerprint=JSON.stringify(value);
     if(prior&&prior.fingerprint!==fingerprint){json(409,{error:{code:'idempotency_conflict'}});return;}
     const taskId=prior?.taskId??'mock-core-'+(++counter);tasks.set(boundKey,{taskId,fingerprint});taskOwners.set(taskId,identity);
     if(faults.loseSubmitResponse){faults.loseSubmitResponse=false;req.socket.destroy();return;}
     json(202,faults.malformedTask?{status:'queued',request_id:taskId}:{...accepted,task:{...accepted.task,id:taskId},request_id:taskId,...(prior?{core_replay:true}:{})});return;
    }
    if(path==='/v1/chat/completions'){if(faults.loseChatResponse){faults.loseChatResponse=false;req.socket.destroy();return;}if(faults.chatDelayMs)await new Promise(resolve=>setTimeout(resolve,faults.chatDelayMs));json(200,{id:'mock-chat-'+(++counter),object:'chat.completion',model:'fake-text-only',choices:[{index:0,message:{role:'assistant',content:faults.chatContent??'本地模拟文字结果，非真实模型输出'}}]});return;}
   }
   if(method==='GET'&&path==='/v1/video-works/work-1'&&faults.workResponse&&[...taskOwners.values()].includes(identity)){json(200,faults.workResponse);return;}
   const match=path.match(/^\/v1\/videos\/(mock-core-\d+)(\/content)?$/);
   if(method==='GET'&&match&&taskOwners.get(match[1])===identity){
    if(match[2]){if(faults.contentRedirect){res.writeHead(302,{Location:faults.contentRedirect});res.end();return;}res.writeHead(200,{'Content-Type':'video/mp4','X-Studio-Mock':'true'});const bytes=options.contentBytes??new Uint8Array([0,0,0,12,102,116,121,112,105,115,111,109]);if(faults.streamContent){res.write(bytes.subarray(0,4));res.end(bytes.subarray(4));}else res.end(bytes);return;}
    if(faults.statusErrorOnce){const status=faults.statusErrorOnce;faults.statusErrorOnce=undefined;if(faults.statusRetryAfter)res.setHeader('Retry-After',faults.statusRetryAfter);json(status,{error:{code:status===429?'bridge_workers_busy':'budget_result_unavailable'}});return;}
    json(200,{...completed,task:{...completed.task,id:match[1],status:faults.queryStatus??'completed',content_url:'/v1/videos/'+match[1]+'/content'},request_id:match[1]});return;
   }
   json(404,{error:{code:'not_found'}});
  }catch{if(!res.writableEnded)json(400,{error:{code:'invalid_request_error'}});}
 });
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});const address=server.address();if(!address||typeof address==='string')throw Error('mock_bind_failed');const origin='http://127.0.0.1:'+address.port,revoke=registerTestMockOrigin(origin);
 return {origin,requests,faults,taskCount:()=>tasks.size,close:()=>new Promise<void>((resolve,reject)=>server.close(error=>{revoke();if(error)reject(error);else resolve();}))};
}
