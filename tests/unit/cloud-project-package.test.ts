import {it,expect,vi} from 'vitest';
import {exportCloudProject,inspectCloudProject,importCloudProject} from '../../src/features/workspace/cloud-project-package';
import {createPackageZip,encodeJson} from '../../src/infrastructure/packages/package-limits';
import {packageMediaPath,type CloudProjectPackage} from '../../src/domain/cloud-project-package';
import type {WorkspaceClient} from '../../src/infrastructure/api/workspace-client';
const id='11111111-1111-4111-8111-111111111111';
const png=new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6nRAAAAAASUVORK5CYII=','base64'));
async function data():Promise<CloudProjectPackage>{
 const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',png))].map(n=>n.toString(16).padStart(2,'0')).join('');
 return {format:'aiwork-studio-cloud-project',version:1,createdAt:1,project:{id,schemaVersion:1,title:'完整云项目',description:'',tags:[],revision:0,createdAt:1,updatedAt:1,archived:false,trashedAt:null},graph:{projectId:id,revision:0,nodes:[],edges:[],viewport:{x:0,y:0,scale:1}},assets:[{asset:{id:'22222222-2222-4222-8222-222222222222',sha256,mediaType:'image',mimeType:'image/png',bytes:png.length,blobKey:'sha256:'+sha256,title:'原件',createdAt:1},thumbnail:{sha256,bytes:png.length,mimeType:'image/png'}}],history:{receipts:[],undo:[],redo:[]}};
}
it('roundtrips original and thumbnail files through a checked ZIP without opening a local database',async()=>{
 const snapshot=await data(),downloadAsset=vi.fn<WorkspaceClient['downloadAsset']>(async()=>new Blob([png],{type:'image/png'}));
 const exported=await exportCloudProject({exportProject:async()=>snapshot,downloadAsset},id),plan=await inspectCloudProject(exported.blob);
 expect(plan.data).toEqual(snapshot);expect(plan.files.size).toBe(2);expect(downloadAsset.mock.calls.map(call=>call.slice(0,2))).toEqual([[snapshot.assets[0].asset.id,'original'],[snapshot.assets[0].asset.id,'thumbnail']]);
});
it('refuses missing thumbnails, corrupt original bytes and unexpected ZIP entries before any upload',async()=>{
 const snapshot=await data(),original=packageMediaPath(snapshot.assets[0].asset.sha256,'original'),thumbnail=packageMediaPath(snapshot.assets[0].asset.sha256,'thumbnail');
 for(const entries of [{'project.json':encodeJson(snapshot),[original]:png},{'project.json':encodeJson(snapshot),[original]:new Uint8Array(png.length),[thumbnail]:png},{'project.json':encodeJson(snapshot),[original]:png,[thumbnail]:png,'unexpected.json':encodeJson({})}])await expect(inspectCloudProject(createPackageZip(entries))).rejects.toThrow();
});
it('keeps a single project import identity and reuses completed owned uploads after an uncertain commit',async()=>{
 const snapshot=await data(),original=packageMediaPath(snapshot.assets[0].asset.sha256,'original'),thumbnail=packageMediaPath(snapshot.assets[0].asset.sha256,'thumbnail');
 const plan=await inspectCloudProject(createPackageZip({'project.json':encodeJson(snapshot),[original]:png,[thumbnail]:png}));
 const owned='33333333-3333-4333-8333-333333333333',api={reserveAsset:vi.fn(async()=>({id:owned,state:'pending' as const})),uploadFile:vi.fn(async()=>undefined),completeAsset:vi.fn(async()=>({...snapshot.assets[0].asset,id:owned})),importProject:vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValue({project:{...snapshot.project,id:owned}})};
 await expect(importCloudProject(api,plan)).rejects.toThrow('network');await importCloudProject(api,plan);expect(api.reserveAsset).toHaveBeenCalledTimes(1);expect(api.uploadFile).toHaveBeenCalledTimes(2);expect(api.importProject.mock.calls[1]).toEqual(api.importProject.mock.calls[0]);
});
