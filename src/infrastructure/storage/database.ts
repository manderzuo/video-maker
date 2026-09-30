import {databaseVersion,migrateDatabase,tableNames,type TableName} from './migrations';
export {tableNames,type TableName};
export type StudioDb={connection:IDBDatabase;tables:typeof tableNames;close:()=>void};
export async function openStudioDb(options:{factory?:IDBFactory;name?:string}={}):Promise<StudioDb>{
 return new Promise((resolve,reject)=>{
  let settled=false;
  const r=(options.factory??indexedDB).open(options.name??'aiwork-studio:v1',databaseVersion);
  r.onupgradeneeded=()=>migrateDatabase(r.result,r.transaction!);
  r.onsuccess=()=>{
   if(settled){r.result.close();return;}
   settled=true;r.result.onversionchange=()=>r.result.close();
   resolve({connection:r.result,tables:tableNames,close:()=>r.result.close()});
  };
  r.onerror=()=>{if(!settled){settled=true;reject(new Error(r.error?.name==='VersionError'?'db_schema_too_new':r.error?.name??'db_open_failed'));}};
  r.onblocked=()=>{if(!settled){settled=true;reject(new Error('db_blocked_close_old_tabs'));}};
 });
}
export function requestResult<T>(r:IDBRequest<T>):Promise<T>{return new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error??new Error('storage_request_failed'));});}
export async function transact<T>(db:StudioDb,tables:TableName[],mode:IDBTransactionMode,work:(tx:IDBTransaction)=>Promise<T>|T):Promise<T>{
 const tx=db.connection.transaction(tables,mode);
 const complete=new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error??new DOMException('Transaction aborted','AbortError'));tx.onerror=()=>{/* onabort supplies the transaction outcome */};});
 // Attach a handler immediately: request errors may abort while work awaits another request.
 void complete.catch(()=>{});
 try{const result=await work(tx);await complete;return result;}
 catch(error){try{tx.abort();}catch{/* Already finished or aborted. */}await complete.catch(()=>{});throw error;}
}
export async function withDatabase<T>(db:StudioDb|undefined,action:(db:StudioDb)=>Promise<T>):Promise<T>{const connection=db??await openStudioDb();try{return await action(connection);}finally{if(!db)connection.close();}}
export function storageErrorCode(error:unknown){if(error instanceof Error&&error.name==='QuotaExceededError')return 'storage_quota_exceeded';if(error instanceof Error&&error.name==='AbortError')return 'storage_transaction_aborted';return error instanceof Error?error.message:'storage_save_failed';}
