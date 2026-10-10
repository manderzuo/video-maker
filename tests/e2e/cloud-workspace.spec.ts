import {test,expect} from '../helpers/cloud-workspace-ui-fixture';
test('automatically saves settled canvas edits and recovers them after refresh',async({page,workspace})=>{
 const project=(await workspace.call('POST','/studio-api/projects',{...workspace.headers(workspace.account),payload:{title:'自动保存画布'}})).json();await page.goto('/projects/'+project.id+'/canvas');await page.getByRole('button',{name:'添加文字节点',exact:true}).click();await page.getByLabel('节点文本',{exact:true}).fill('无需另点保存也能恢复');await expect(page.getByRole('status').filter({hasText:'已保存 · 云端修订'})).toContainText('已保存');await page.reload();await expect(page.getByLabel('节点文本',{exact:true})).toHaveValue('无需另点保存也能恢复');
});
test('creates a cloud project, edits canvas text, restores after reload, and uses persisted undo/redo',async({page,workspace})=>{
 await page.goto('/projects');await page.getByRole('button',{name:'新建项目',exact:true}).click();await page.getByLabel('项目名称',{exact:true}).fill('我的云端故事');await page.getByRole('button',{name:'创建项目',exact:true}).click();
 await expect(page.getByRole('link',{name:'我的云端故事',exact:true})).toBeVisible();await page.getByRole('link',{name:'我的云端故事',exact:true}).click();
 await page.getByRole('button',{name:'添加文字节点',exact:true}).click();await page.getByLabel('节点文本',{exact:true}).fill('刷新以后仍然存在');await page.getByRole('button',{name:'保存到云端',exact:true}).click();await expect(page.getByRole('status')).toContainText('已保存');
 await page.reload();await expect(page.getByLabel('节点文本',{exact:true})).toHaveValue('刷新以后仍然存在');await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(page.getByLabel('节点文本',{exact:true})).toHaveCount(0);await page.getByRole('button',{name:'重做',exact:true}).click();await expect(page.getByLabel('节点文本',{exact:true})).toHaveValue('刷新以后仍然存在');
 const stored=await workspace.pool.query('SELECT graph FROM workspace_graphs WHERE user_id=$1',[workspace.account.view.user.id]);expect(stored.rows[0].graph.nodes[0].data.text).toBe('刷新以后仍然存在');
});
test('uploads an original and reads it from cloud assets after refresh',async({page,workspace})=>{
 await page.goto('/assets');const png=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=2;canvas.getContext('2d')!.fillRect(0,0,2,2);return canvas.toDataURL('image/png').split(',')[1];});await page.getByLabel('选择素材文件',{exact:true}).setInputFiles({name:'参考图片.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});await page.getByRole('button',{name:'上传到云端',exact:true}).click();await expect(page.getByText('参考图片.png',{exact:true})).toBeVisible();
 await page.reload();await expect(page.getByText('参考图片.png',{exact:true})).toBeVisible();const saved=await workspace.pool.query("SELECT state,document FROM workspace_assets WHERE user_id=$1",[workspace.account.view.user.id]);expect(saved.rows).toHaveLength(1);expect(saved.rows[0].state).toBe('complete');
});
test('switches accounts without showing the previous owned projects or reading old IndexedDB',async({page,workspace})=>{
 await page.addInitScript(()=>{Object.defineProperty(window,'indexedDB',{get(){throw new Error('LEGACY_DB_MUST_NOT_OPEN');}});});
 await workspace.call('POST','/studio-api/projects',{...workspace.headers(workspace.account),payload:{title:'仅属于账号 A'}});await page.goto('/projects');await expect(page.getByRole('link',{name:'仅属于账号 A',exact:true})).toBeVisible();
 const b=await workspace.signup('Cloud_UI_B');workspace.switchAccount(b);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.getByTitle('当前账号：Cloud_UI_B',{exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'仅属于账号 A',exact:true})).toHaveCount(0);await expect(page.getByText('还没有项目',{exact:true})).toBeVisible();
});
test('copies a project with its current cloud graph and preserves project search and metadata actions',async({page,workspace})=>{
 const created=await workspace.call('POST','/studio-api/projects',{...workspace.headers(workspace.account),payload:{title:'可复制项目',tags:['云端']}});expect(created.statusCode).toBe(201);
 await page.goto('/projects');await page.getByRole('button',{name:'复制项目',exact:true}).click();await expect(page.getByRole('link',{name:'可复制项目 副本',exact:true})).toBeVisible();
 const card=page.locator('.cloud-project-list li').filter({has:page.getByRole('link',{name:'可复制项目 副本',exact:true})});await card.getByRole('button',{name:'星标',exact:true}).click();await page.getByRole('combobox',{name:'项目筛选',exact:true}).selectOption('starred');await expect(page.getByRole('link',{name:'可复制项目',exact:true})).toHaveCount(0);await expect(page.getByRole('link',{name:'可复制项目 副本',exact:true})).toBeVisible();
 await page.reload();expect((await workspace.pool.query('SELECT id FROM workspace_projects WHERE user_id=$1',[workspace.account.view.user.id])).rows).toHaveLength(2);
});
test('exports and explicitly imports a complete package with an original, thumbnail and undo history',async({page,workspace},testInfo)=>{
 await page.goto('/assets');const png=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=2;canvas.getContext('2d')!.fillRect(0,0,2,2);return canvas.toDataURL('image/png').split(',')[1];});
 await page.getByLabel('选择素材文件',{exact:true}).setInputFiles({name:'打包图片.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});await page.getByRole('button',{name:'上传到云端',exact:true}).click();await expect(page.getByText('打包图片.png',{exact:true})).toBeVisible();
 const asset=(await workspace.pool.query('SELECT document FROM workspace_assets WHERE user_id=$1',[workspace.account.view.user.id])).rows[0].document;
 const project=(await workspace.call('POST','/studio-api/projects',{...workspace.headers(workspace.account),payload:{title:'完整导入导出'}})).json();
 const node={id:crypto.randomUUID(),type:'asset',title:'包内节点',x:40,y:20,locked:false,data:{kind:'asset',assetId:asset.id}};
 const saved=await workspace.call('POST',`/studio-api/projects/${project.id}/commands`,{...workspace.headers(workspace.account),payload:{expectedRevision:0,idempotencyKey:crypto.randomUUID(),command:{type:'operations',operations:[{id:crypto.randomUUID(),type:'add_node',payload:{node}}]}}});expect(saved.statusCode).toBe(200);
 await page.goto('/projects');const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'导出完整项目包',exact:true}).click();const downloaded=await downloading,path=testInfo.outputPath('complete-cloud-project.zip');await downloaded.saveAs(path);
 await page.getByRole('button',{name:'导入云端项目包',exact:true}).click();await page.getByLabel('选择云端项目包',{exact:true}).setInputFiles(path);await page.getByRole('button',{name:'校验并预览',exact:true}).click();await expect(page.getByText('1 个节点 · 1 个素材 · 1 条画布历史',{exact:true})).toBeVisible();expect((await workspace.pool.query('SELECT id FROM workspace_projects')).rows).toHaveLength(1);
 await page.getByRole('button',{name:'确认导入当前账号',exact:true}).click();await expect(page.getByRole('link',{name:'完整导入导出',exact:true})).toHaveCount(2);
 const stored=(await workspace.pool.query('SELECT graph FROM workspace_graphs ORDER BY project_id')).rows;expect(stored).toHaveLength(2);expect(stored.every(row=>row.graph.nodes[0].data.assetId===asset.id)).toBe(true);expect(stored[0].graph.nodes[0].id).not.toBe(stored[1].graph.nodes[0].id);
});
