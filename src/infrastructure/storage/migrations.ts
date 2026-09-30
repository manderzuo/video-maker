export const databaseVersion=2;
export const tableNames=['projects','graphs','assets','blobs','runs','promptDrafts','promptRuns','prompts','connections','proposals','receipts','leases','diagnostics','references'] as const;
export type TableName=typeof tableNames[number];
export function migrateDatabase(db:IDBDatabase,tx:IDBTransaction){
 for(const table of tableNames){
  const store=db.objectStoreNames.contains(table)?tx.objectStore(table):db.createObjectStore(table,{keyPath:table==='graphs'?'projectId':'id'});
  const fields=table==='runs'?['projectId','authBindingId','connectionId']:table==='promptRuns'?['draftId','authBindingId']:['diagnostics','references','leases'].includes(table)?['projectId']:[];
  for(const field of fields)if(!store.indexNames.contains(field))store.createIndex(field,field,{unique:false});
 }
}
