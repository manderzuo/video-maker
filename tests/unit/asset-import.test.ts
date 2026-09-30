import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {IDBFactory,IDBObjectStore} from 'fake-indexeddb';
import {openStudioDb,transact,requestResult,type StudioDb} from '../../src/infrastructure/storage/database';
import {importAssets} from '../../src/features/assets/import-service';
let db:StudioDb;
const png=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aPQ0AAAAASUVORK5CYII='),c=>c.charCodeAt(0));
const file=(name='图片.png',bytes=png)=>new File([bytes],name,{type:'image/png'});
const rows=(store:'assets'|'blobs')=>transact(db,[store],'readonly',tx=>requestResult(tx.objectStore(store).getAll()));
beforeEach(async()=>{db=await openStudioDb({factory:new IDBFactory(),name:'asset-import'});});
afterEach(()=>{db.close();vi.restoreAllMocks();});
it('T07-C01/C02: product batch limit 50 is enforced before any persistence or upload',async()=>{
 const report=await importAssets(Array.from({length:51},(_,i)=>file(i+'.png')),undefined,{db});
 expect(report.errorCode).toBe('import_file_count_exceeded');expect(await rows('assets')).toHaveLength(0);expect(await rows('blobs')).toHaveLength(0);
 const accepted=await importAssets(Array.from({length:50},(_,i)=>file(i+'.png')),undefined,{db});expect(accepted.successes).toHaveLength(50);
});
it('T07-C03: damaged files fail individually without losing other imports',async()=>{
 const result=await importAssets([file(),file('损坏.png',new Uint8Array([1,2,3]))],undefined,{db});
 expect(result.successes).toHaveLength(1);expect(result.failures).toEqual([{fileName:'损坏.png',errorCode:'media_invalid_signature'}]);
 expect(result.successes[0].asset.width).toBe(1);
});
it('T07-C04: content hash deduplicates, different same-name files remain distinct',async()=>{
 const first=await importAssets([file('同名.png'),file('另一名字.png')],undefined,{db});expect(first.successes[1].deduplicated).toBe(true);
 const changed=png.slice();changed[changed.length-1]^=1;
 const second=await importAssets([file('同名.png',changed)],undefined,{db});expect(second.successes[0].asset.id).not.toBe(first.successes[0].asset.id);
 expect(await rows('assets')).toHaveLength(2);expect(await rows('blobs')).toHaveLength(2);
});
it('T07-C05/C06: unreadable duration remains absent, selection has no network side effect',async()=>{
 const spy=vi.spyOn(globalThis,'fetch');const header=new Uint8Array(24);header.set([0,0,0,24,102,116,121,112,105,115,111,109]);
 const r=await importAssets([new File([header],'本地视频.mp4',{type:'video/mp4'})],undefined,{db});
 expect(r.successes).toHaveLength(1);expect(r.successes[0].asset.durationSeconds).toBeUndefined();expect(spy).not.toHaveBeenCalled();
});
it('blob failure aborts asset association atomically and reports the item failure',async()=>{
 const original=IDBObjectStore.prototype.put;
 vi.spyOn(IDBObjectStore.prototype,'put').mockImplementation(function(this:IDBObjectStore,...args){if(this.name==='blobs')throw new DOMException('test quota','QuotaExceededError');return original.apply(this,args);});
 const r=await importAssets([file()],undefined,{db});expect(r.failures[0].errorCode).toBe('storage_quota_exceeded');expect(await rows('assets')).toHaveLength(0);expect(await rows('blobs')).toHaveLength(0);
});
it('concurrent imports cannot create two asset identities for one hash',async()=>{
 await Promise.all([importAssets([file()],undefined,{db}),importAssets([file()],undefined,{db})]);expect(await rows('assets')).toHaveLength(1);expect(await rows('blobs')).toHaveLength(1);
});
