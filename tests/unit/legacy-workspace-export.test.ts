import {expect,it,vi} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {openStudioDb,transact,requestResult} from '../../src/infrastructure/storage/database';
import {f} from '../helpers/fixtures';
import {readLegacyWorkspace} from '../../src/features/migration/legacy-reader';
import {exportLegacyWorkspace,inspectWorkspaceMigration} from '../../src/features/migration/workspace-migration-package';
const hash=async(blob:Blob)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(n=>n.toString(16).padStart(2,'0')).join('');
it('exports an existing browser database read-only with originals, thumbnails, standalone writing, history and trash but no authorization',async()=>{
 const factory=new IDBFactory(),db=await openStudioDb({factory}),blob=new Blob([new Uint8Array([137,80,78,71,13,10,26,10])],{type:'image/png'}),sha256=await hash(blob),asset=f.asset({sha256,bytes:blob.size,mimeType:'image/png',blobKey:'original'}),graph=f.graph({nodes:[{id:'asset-node',type:'asset',title:'素材',x:0,y:0,locked:false,data:{kind:'asset',assetId:asset.id}}]});
 await transact(db,['projects','graphs','assets','blobs','promptDrafts','prompts','receipts','connections','leases'],'readwrite',tx=>{
  tx.objectStore('projects').put(f.project({trashedAt:10}));tx.objectStore('graphs').put(graph);tx.objectStore('assets').put(asset);tx.objectStore('blobs').put({id:'original',blob});tx.objectStore('blobs').put({id:'thumbnail:'+sha256,blob});
  tx.objectStore('prompts').put({id:'library',title:'独立提示词',body:'原文',tags:[],variables:[],source:'自有',license:'自有',revision:0,starred:false,trashed:true});
  tx.objectStore('receipts').put({id:'agent-conversation:old',kind:'agent-local-conversation',projectId:graph.projectId,title:'旧会话',sessionIds:['DO_NOT_EXPORT_SESSION'],createdAt:1,updatedAt:2});tx.objectStore('receipts').put({id:'agent-note:old',kind:'agent-local-note',projectId:graph.projectId,conversationId:'agent-conversation:old',body:'旧任务描述',context:{scope:'project',nodeIds:[],revision:0},createdAt:1});
  tx.objectStore('receipts').put({id:'credential-vault',apiKey:'DO_NOT_EXPORT_KEY'});tx.objectStore('connections').put({id:'conn',apiKey:'DO_NOT_EXPORT_KEY'});tx.objectStore('leases').put({id:'lease',authorization:'DO_NOT_EXPORT_AUTH'});
 });
 const before=await transact(db,['projects','receipts'],'readonly',async tx=>({projects:await requestResult(tx.objectStore('projects').getAll()),receipts:await requestResult(tx.objectStore('receipts').getAll())}));db.close();
 const network=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('must not upload'));
 try{const snapshot=await readLegacyWorkspace({factory,preferences:'{"theme":"light","apiKey":"DO_NOT_EXPORT_KEY"}'}),result=await exportLegacyWorkspace(snapshot,{projectIds:['p1'],includeStandalone:true,includeTrash:true,includePreferences:true}),plan=await inspectWorkspaceMigration(result.blob);
  expect(plan.data.projects).toHaveLength(1);expect(plan.data.projects[0].project.trashedAt).toBe(10);expect(plan.data.assets[0].thumbnail).toBeDefined();expect(plan.files.size).toBe(2);expect(plan.data.records.some(record=>record.kind==='prompt'&&record.id==='library')).toBe(true);expect(JSON.stringify(plan.data)).toContain('旧任务描述');expect(JSON.stringify(plan.data)).not.toMatch(/DO_NOT_EXPORT|sessionIds|apiKey|authorization/);expect(plan.data.preferences).toMatchObject({theme:'light'});expect(network).not.toHaveBeenCalled();
  const reopened=await openStudioDb({factory});try{expect(await transact(reopened,['projects','receipts'],'readonly',async tx=>({projects:await requestResult(tx.objectStore('projects').getAll()),receipts:await requestResult(tx.objectStore('receipts').getAll())}))).toEqual(before);}finally{reopened.close();}
 }finally{network.mockRestore();}
});
it('does not create or upgrade a missing legacy database',async()=>{const factory=new IDBFactory();expect(await readLegacyWorkspace({factory})).toMatchObject({projects:[],assets:[],records:[]});expect(await factory.databases()).toEqual([]);});
it('rejects damaged media and preserves the original migration file',async()=>{
 const factory=new IDBFactory(),db=await openStudioDb({factory});await transact(db,['projects','graphs','assets','blobs'],'readwrite',tx=>{tx.objectStore('projects').put(f.project());tx.objectStore('graphs').put(f.graph());tx.objectStore('assets').put(f.asset());tx.objectStore('blobs').put({id:'sha256:hash',blob:new Blob(['wrong'])});});db.close();const snapshot=await readLegacyWorkspace({factory});await expect(exportLegacyWorkspace(snapshot,{projectIds:['p1'],includeStandalone:true,includeTrash:true,includePreferences:false})).rejects.toThrow('migration_file_integrity');
});
