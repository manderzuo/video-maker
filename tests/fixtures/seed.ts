import {openStudioDb,transact} from '../../src/infrastructure/storage/database';
import {f} from '../helpers/fixtures';
export async function seedScenario(name:string){
 if(!['project-library','canvas-project'].includes(name))throw new Error('scenario_not_implemented');
 const db=await openStudioDb();
 try{await transact(db,db.tables.slice(),'readwrite',tx=>{
  for(const table of db.tables)tx.objectStore(table).clear();
  if(name==='canvas-project'){
   tx.objectStore('projects').put(f.project());tx.objectStore('graphs').put(f.graph({nodes:[{id:'text-1',type:'text',title:'镜头一',x:80,y:80,locked:false,data:{kind:'text',text:'原创镜头',referenceTokens:[]}}]}));return;
  }
  for(const project of [f.project({title:'项目甲'}),f.project({id:'p2',title:'项目乙'}),f.project({id:'p3',title:'归档项目',archived:true})])tx.objectStore('projects').put(project);
  for(const projectId of ['p1','p2'])tx.objectStore('graphs').put(f.graph({projectId,nodes:[{id:'asset-'+projectId,type:'asset',title:'共享素材',x:32,y:32,locked:false,data:{kind:'asset',assetId:'a1'}}]}));
  tx.objectStore('graphs').put(f.graph({projectId:'p3'}));tx.objectStore('assets').put(f.asset());tx.objectStore('blobs').put({id:'blob-a1',blob:new Blob(['原创共享素材'])});
  tx.objectStore('runs').put(f.run({executionState:'submit_unknown',inputSnapshot:{assetId:'a1'}}));
 });}finally{db.close();}
}
