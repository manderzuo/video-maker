import {createHash} from 'node:crypto';
import {test,expect} from '../helpers/cloud-workspace-ui-fixture';
import {zipSync,strToU8} from 'fflate';
// F025：用户明确选择的旧离线包（infinite-canvas v3 projects.json）在云端账号下
// 安全转换/预览/导入：只读用户文件，不碰匿名库，不恢复旧授权与无类型连线。
function legacyZip(extraNodes:Record<string,unknown>[]=[],extraEntries:Record<string,Uint8Array>={},extraFiles:{storageKey:string;path:string;mimeType:string;bytes:number}[]=[]){
 const legacy={app:'infinite-canvas',version:3,projects:[{project:{id:'legacy-p',title:'旧离线包',nodes:[{id:'legacy-n',type:'text',title:'旧文本',position:{x:1,y:1},metadata:{content:'离线文本内容'}},{id:'legacy-config',type:'config',title:'旧配置',position:{x:2,y:2},metadata:{apiKey:'not-portable',endpoint:'https://old.invalid'}},...extraNodes],connections:[{id:'legacy-edge',fromNodeId:'legacy-n',toNodeId:'legacy-config'}],viewport:{x:0,y:0,k:1}},files:extraFiles}]};
 return Buffer.from(zipSync({'projects.json':strToU8(JSON.stringify(legacy)),...extraEntries}));
}
test('converts an explicitly chosen legacy offline package and imports it without secrets',async({page,workspace})=>{
 const buffer=legacyZip();
 await page.goto('/projects');
 await page.getByRole('button',{name:'导入云端项目包',exact:true}).click();
 await page.getByLabel('选择云端项目包',{exact:true}).setInputFiles({name:'legacy.zip',mimeType:'application/zip',buffer});
 await page.getByRole('button',{name:'校验并预览',exact:true}).click();
 await expect(page.locator('[data-interaction-id="cloud:project:legacy-note"]')).toContainText('旧离线包');
 await expect(page.locator('[data-interaction-id="cloud:project:legacy-note"]')).toContainText('1 个不支持的旧节点已隔离');
 await expect(page.getByText('1 个节点 · 0 个素材 · 0 条画布历史',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'确认导入当前账号',exact:true}).click();
 await expect(page.getByRole('link',{name:'旧离线包',exact:true})).toBeVisible();
 // 同一原包可再次选择校验与导入：原文件未被消耗或改写。
 await page.getByRole('button',{name:'导入云端项目包',exact:true}).click();
 await page.getByLabel('选择云端项目包',{exact:true}).setInputFiles({name:'legacy.zip',mimeType:'application/zip',buffer});
 await page.getByRole('button',{name:'校验并预览',exact:true}).click();
 await expect(page.locator('[data-interaction-id="cloud:project:legacy-note"]')).toContainText('旧离线包');
 await page.getByRole('button',{name:'确认导入当前账号',exact:true}).click();
 await expect(page.getByRole('link',{name:'旧离线包',exact:true})).toHaveCount(2);
 const graphs=(await workspace.pool.query('SELECT graph FROM workspace_graphs')).rows.map(row=>row.graph as {nodes:{id:string;type:string;title:string;data:Record<string,unknown>}[];edges:unknown[]});
 expect(graphs).toHaveLength(2);
 for(const graph of graphs){
  expect(graph.nodes.map(node=>node.type)).toEqual(['text']);
  expect(graph.nodes[0]).toMatchObject({title:'旧文本',data:{kind:'text',text:'离线文本内容'}});
  expect(graph.edges).toHaveLength(0);
 }
 expect(JSON.stringify(graphs)).not.toContain('not-portable');
 expect(JSON.stringify(graphs)).not.toContain('old.invalid');
 expect(JSON.stringify(graphs)).not.toContain('legacy-config');
 const projects=(await workspace.pool.query('SELECT id FROM workspace_projects')).rows as {id:string}[];
 expect(projects).toHaveLength(2);expect(projects.every(project=>project.id!=='legacy-p')).toBe(true);
});
test('carries real legacy media bytes into the account library',async({page,workspace})=>{
 const png=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=8;return canvas.toDataURL('image/png').split(',')[1];});
 const bytes=Buffer.from(png,'base64'),digest=createHash('sha256').update(bytes).digest('hex');
 const buffer=legacyZip([{id:'legacy-img',type:'image',title:'旧图片',position:{x:3,y:3},metadata:{storageKey:'legacy-png'}}],{'legacy.png':new Uint8Array(bytes)},[{storageKey:'legacy-png',path:'legacy.png',mimeType:'image/png',bytes:bytes.length}]);
 await page.goto('/projects');
 await page.getByRole('button',{name:'导入云端项目包',exact:true}).click();
 await page.getByLabel('选择云端项目包',{exact:true}).setInputFiles({name:'legacy-media.zip',mimeType:'application/zip',buffer});
 await page.getByRole('button',{name:'校验并预览',exact:true}).click();
 await expect(page.locator('[data-interaction-id="cloud:project:legacy-note"]')).toContainText('旧离线包');
 await expect(page.getByText('2 个节点 · 1 个素材 · 0 条画布历史',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'确认导入当前账号',exact:true}).click();
 await expect(page.getByRole('link',{name:'旧离线包',exact:true})).toBeVisible();
 await page.goto('/assets');
 await expect(page.getByText('旧图片',{exact:false}).first()).toBeVisible();
 await expect(page.locator('img[alt="旧图片"]')).toHaveCount(1);
 const stored=(await workspace.pool.query("SELECT document FROM workspace_assets WHERE user_id=$1 AND document->>'title'='旧图片'",[workspace.account.view.user.id])).rows.map(row=>row.document as {sha256:string;bytes:number;state?:string});
 expect(stored).toHaveLength(1);expect(stored[0]).toMatchObject({sha256:digest,bytes:bytes.length});
 const graphs=(await workspace.pool.query('SELECT graph FROM workspace_graphs')).rows.map(row=>row.graph as {nodes:{type:string;data:Record<string,unknown>}[]});
 expect(graphs).toHaveLength(1);
 expect(graphs[0].nodes.filter(node=>node.type==='asset')).toHaveLength(1);
 expect(JSON.stringify(graphs)).not.toContain('not-portable');
 expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(0);
});
