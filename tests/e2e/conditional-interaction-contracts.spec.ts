import {test,expect} from '../helpers/network-guard';
const media=[
 {id:'X-01',title:'图片生成',absent:['生成图片','选择图片模型']},
 {id:'X-02',title:'参考图编辑',absent:['编辑图片','上传编辑遮罩']},
 {id:'X-03',title:'音频生成',absent:['生成音频','选择音色']},
 {id:'X-04',title:'远端取消任务',absent:['取消远端任务','确认远端取消']},
];
for(const gate of media)test('T44 '+gate.id+' conditional media interaction remains absent and its actual explanation cannot authorize a business request',async({page,networkCounter})=>{
 await page.goto('/settings/capabilities');await page.getByLabel('显示未开放能力说明',{exact:true}).check();await page.getByRole('button',{name:'查看'+gate.title+'开放条件',exact:true}).click();const dialog=page.getByRole('dialog',{name:gate.title+'开放条件',exact:true});await expect(dialog).toContainText('条件未满足');await expect(dialog).toContainText('普通用户');for(const name of gate.absent)await expect(page.getByRole('button',{name,exact:true})).toHaveCount(0);await dialog.getByRole('button',{name:'关闭说明',exact:true}).click();await expect(dialog).not.toBeVisible();expect(networkCounter.requests.filter(r=>['POST','PUT','PATCH','DELETE'].includes(r.method))).toHaveLength(0);expect(networkCounter.paidRequests).toHaveLength(0);
});
test('T44 Y01/Y02/Y03/Y04/Y05 unverified WebDAV has an inspectable local explanation and no endpoint, sync, upload, restore or schedule controls',async({page,networkCounter})=>{
 await page.goto('/settings/backup');await page.getByRole('button',{name:'查看WebDAV 版本化备份开放条件',exact:true}).click();const dialog=page.getByRole('dialog',{name:'WebDAV 版本化备份开放条件',exact:true});await expect(dialog).toContainText('固定授权端点');await expect(dialog).toContainText('冲突另存');await expect(dialog).toContainText('失败保留本地项目');for(const name of ['测试备份连接','同步备份','上传备份','恢复远端备份','设置自动备份','手动上传WebDAV'])await expect(page.getByRole('button',{name,exact:true})).toHaveCount(0);await expect(page.getByRole('textbox')).toHaveCount(0);await dialog.getByRole('button',{name:'关闭说明',exact:true}).click();expect(networkCounter.requests.filter(r=>['POST','PUT','PATCH','DELETE'].includes(r.method))).toHaveLength(0);expect(networkCounter.paidRequests).toHaveLength(0);
});
