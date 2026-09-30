import {beforeEach,afterEach,it,expect} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {openStudioDb,transact,requestResult,type StudioDb} from '../../src/infrastructure/storage/database';
import {createProject,cloneProject,updateProjectMetadata,listProjects} from '../../src/features/projects/project-service';
import {f} from '../helpers/fixtures';
let db:StudioDb;
beforeEach(async()=>{db=await openStudioDb({factory:new IDBFactory(),name:'project-library-unit'});});
afterEach(()=>db.close());
it('T12 new project accepts 1/60 Unicode characters and refuses 0/61 before persistence',async()=>{
 await expect(createProject({title:''},{db})).rejects.toThrow();await expect(createProject({title:'中'.repeat(61)},{db})).rejects.toThrow();expect(await listProjects(db)).toHaveLength(0);
 await createProject({title:'中'},{db});await createProject({title:'中'.repeat(60)},{db});expect(await listProjects(db)).toHaveLength(2);
});
it('cloning preserves safe metadata and asset identities while refreshing node identities',async()=>{
 await transact(db,['projects','graphs'],'readwrite',tx=>{tx.objectStore('projects').put(f.project({tags:['品牌'],description:'原创说明'}));tx.objectStore('graphs').put(f.graph({nodes:[{id:'n1',type:'asset',title:'参考',x:32,y:48,locked:false,data:{kind:'asset',assetId:'a1'}}]}));});
 const copy=await cloneProject('p1',{db});expect(copy.tags).toEqual(['品牌']);expect(copy.description).toBe('原创说明');expect(copy.id).not.toBe('p1');
});
it('metadata updates reject undeclared immutable/system fields rather than overwriting them',async()=>{
 const created=await createProject({title:'原创'},{db});
 const patch={title:'新名称',createdAt:0};
 await expect(updateProjectMetadata(created.id,1,patch,db)).rejects.toThrow();expect((await listProjects(db))[0].createdAt).toBe(created.createdAt);
});
it('clone retains explicitly imported project attachments even when they are not placed on the graph',async()=>{
 await transact(db,['projects','graphs','assets','references'],'readwrite',tx=>{tx.objectStore('projects').put(f.project());tx.objectStore('graphs').put(f.graph());tx.objectStore('assets').put(f.asset());tx.objectStore('references').put({id:'import:p1:a1',projectId:'p1',assetId:'a1',revision:1,kind:'project-import'});});
 const copy=await cloneProject('p1',{db});const links=await transact(db,['references'],'readonly',tx=>requestResult(tx.objectStore('references').index('projectId').getAll(copy.id)));
 expect(links).toContainEqual(expect.objectContaining({projectId:copy.id,assetId:'a1',kind:'project-import'}));
});
it('clone keeps an explicitly edited description instead of silently replacing it with source metadata',async()=>{
 await transact(db,['projects','graphs'],'readwrite',tx=>{tx.objectStore('projects').put(f.project({description:'原始说明'}));tx.objectStore('graphs').put(f.graph());});
 const options={db,description:'用户填写的副本说明'};const copy=await cloneProject('p1',options);expect(copy.description).toBe('用户填写的副本说明');
});
