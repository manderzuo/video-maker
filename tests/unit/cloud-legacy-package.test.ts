import {expect,it} from 'vitest';
import {createHash} from 'node:crypto';
import {zipSync,strToU8} from 'fflate';
import {inspectLegacyProject,inspectCloudProject} from '../../src/features/workspace/cloud-project-package';
// 最小合法 1x1 PNG：签名 + IHDR（宽高各 1）+ IEND，CRC 不校验可填零。
const tinyPng=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,6,0,0,0,0,0,0,0,0,0,0,73,69,78,68,0,0,0,0]);
const legacyZip=(withImage=false)=>{const legacy={app:'infinite-canvas',version:3,projects:[{project:{id:'legacy-p',title:'旧离线包',nodes:[{id:'legacy-n',type:'text',title:'旧文本',position:{x:1,y:1},metadata:{content:'离线文本内容'}},{id:'legacy-config',type:'config',title:'旧配置',position:{x:2,y:2},metadata:{apiKey:'not-portable',endpoint:'https://old.invalid'}},...(withImage?[{id:'legacy-img',type:'image',title:'旧图片',position:{x:3,y:3},metadata:{storageKey:'legacy-png'}}]:[])],connections:[{id:'legacy-edge',fromNodeId:'legacy-n',toNodeId:'legacy-config'}],viewport:{x:0,y:0,k:1}},files:withImage?[{storageKey:'legacy-png',path:'legacy.png',mimeType:'image/png',bytes:tinyPng.length}]:[]}]};
 return new Blob([new Uint8Array(zipSync({'projects.json':strToU8(JSON.stringify(legacy)),...(withImage?{'legacy.png':tinyPng}:{})})).buffer],{type:'application/zip'});};
it('converts an explicit legacy offline package without touching anonymous storage',async()=>{
 const plan=await inspectLegacyProject(legacyZip());
 expect(plan.legacy).toEqual({isolated:1});
 expect(plan.data.project.title).toBe('旧离线包');
 expect(plan.data.graph.nodes.map(node=>node.type)).toEqual(['text']);
 expect(plan.data.graph.nodes[0]).toMatchObject({data:{kind:'text',text:'离线文本内容'}});
 expect(plan.data.graph.edges).toHaveLength(0);
 expect(plan.data.assets).toHaveLength(0);
 expect(JSON.stringify(plan)).not.toContain('not-portable');
 expect(JSON.stringify(plan)).not.toContain('https://old.invalid');
});
it('routes a legacy file through the cloud inspection entry',async()=>{
 const plan=await inspectCloudProject(legacyZip());
 expect(plan.legacy).toEqual({isolated:1});
 expect(plan.data.graph.nodes).toHaveLength(1);
});
it('carries real legacy media bytes into the cloud original path',async()=>{
 const plan=await inspectLegacyProject(legacyZip(true));
 expect(plan.legacy).toEqual({isolated:1});
 expect(plan.data.graph.nodes.map(node=>node.type).sort()).toEqual(['asset','text']);
 const digest=createHash('sha256').update(tinyPng).digest('hex');
 expect(plan.data.assets).toHaveLength(1);
 expect(plan.data.assets[0].asset).toMatchObject({mimeType:'image/png',bytes:tinyPng.length,sha256:digest});
 expect([...plan.files.keys()]).toEqual(['media/'+digest+'.original']);
 expect(plan.files.get('media/'+digest+'.original')?.size).toBe(tinyPng.length);
 expect(JSON.stringify(plan)).not.toContain('not-portable');
});
it('rejects a non-package file at the cloud inspection entry',async()=>{
 await expect(inspectCloudProject(new Blob(['not-a-package'],{type:'application/zip'}))).rejects.toThrow();
});
