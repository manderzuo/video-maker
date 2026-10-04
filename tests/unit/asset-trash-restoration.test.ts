import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {IDBFactory,IDBObjectStore} from 'fake-indexeddb';
import {openStudioDb,transact,requestResult,type StudioDb} from '../../src/infrastructure/storage/database';
import {listTrashedAssets,restoreAsset} from '../../src/features/projects/trash-service';
import {f} from '../helpers/fixtures';

let db:StudioDb;
beforeEach(async()=>{db=await openStudioDb({factory:new IDBFactory(),name:'asset-trash-restoration'});});
afterEach(()=>{db.close();vi.restoreAllMocks();});
const asset=()=>transact(db,['assets'],'readonly',tx=>requestResult(tx.objectStore('assets').get('a1')));
const seed=async(trashedAt:number|null)=>{await transact(db,['assets'],'readwrite',tx=>tx.objectStore('assets').put(f.asset({trashedAt})));};

it('lists soft-deleted assets and restores visibility while preserving identity, metadata and source',async()=>{
 await seed(100);
 const original=await asset();
 expect(await listTrashedAssets({db})).toEqual([original]);
 expect(await restoreAsset('a1',100,{db})).toEqual({success:true,id:'a1'});
 expect(await asset()).toEqual({...original,trashedAt:null});
 expect(await listTrashedAssets({db})).toEqual([]);
});

it('rejects a stale trash entry after another deletion or restoration without overwriting current metadata',async()=>{
 await seed(200);
 const current=await asset();
 expect(await restoreAsset('a1',100,{db})).toMatchObject({success:false,errorCode:'asset_trash_conflict'});
 expect(await asset()).toEqual(current);
 expect((await restoreAsset('a1',200,{db})).success).toBe(true);
 const restored=await asset();
 expect(await restoreAsset('a1',200,{db})).toMatchObject({success:false,errorCode:'asset_trash_conflict'});
 expect(await asset()).toEqual(restored);
});

it('a missing asset stays missing and produces a recoverable error',async()=>{
 expect(await restoreAsset('missing',100,{db})).toMatchObject({success:false,errorCode:'resource_not_found'});
 expect(await listTrashedAssets({db})).toEqual([]);
});

it('a failed storage write keeps the original trash entry intact',async()=>{
 await seed(100);
 const original=await asset();
 const write=vi.spyOn(IDBObjectStore.prototype,'put');
 write.mockImplementation(()=>{throw new DOMException('quota','QuotaExceededError');});
 expect(await restoreAsset('a1',100,{db})).toMatchObject({success:false,errorCode:'storage_quota_exceeded'});
 write.mockRestore();
 expect(await asset()).toEqual(original);
});
