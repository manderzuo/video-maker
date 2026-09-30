import {openStudioDb,transact} from '../../src/infrastructure/storage/database';
import {f} from '../helpers/fixtures';
import {createAuthBinding} from '../../src/domain/authorization';
import {setSessionCredential,withCredential} from '../../src/security/credential-session';
import {createCoreClient} from '../../src/adapters/core/http-client';
import {setActiveCore} from '../../src/adapters/core/current-connection';
export const generationCaps=f.caps({videoSpecs:[{modelId:'fake-video-only',durationSeconds:5,ratio:'9:16'}],limits:{assetBytes:32*1024*1024,promptBytes:65536,imageReferences:2,videoReferences:1}});
export async function seedGeneration(){const db=await openStudioDb();try{await transact(db,db.tables.slice(),'readwrite',tx=>{for(const name of db.tables)tx.objectStore(name).clear();tx.objectStore('projects').put(f.project());tx.objectStore('graphs').put(f.graph({nodes:[{id:'text-1',type:'text',title:'确认正文',x:20,y:20,locked:false,data:{kind:'text',text:'原创确认正文',referenceTokens:[]}},{id:'video-1',type:'video-generation',title:'确认视频',x:440,y:20,locked:false,data:{kind:'video-generation',draft:generationCaps.videoSpecs[0],inputBindings:[{nodeId:'text-1',order:0,role:'text'}],stale:false}}],edges:[{id:'e1',sourceId:'text-1',targetId:'video-1',port:'text',order:0}]}));tx.objectStore('diagnostics').put({id:'capability:current',capability:generationCaps});});}finally{db.close();}}
export function connectGeneration(){const profile=f.connection(),binding=createAuthBinding(profile);setSessionCredential(binding.id,'fake-generation-key');const client=createCoreClient(profile,{binding,withCredential},{registry:[profile]});setActiveCore(client,generationCaps);return {binding,client};}
