import {test,expect} from '../helpers/cloud-workspace-ui-fixture';
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
 const b=await workspace.signup('Cloud_UI_B');workspace.switchAccount(b);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.getByText('当前账号：Cloud_UI_B',{exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'仅属于账号 A',exact:true})).toHaveCount(0);await expect(page.getByText('还没有项目',{exact:true})).toBeVisible();
});
