import {test,expect} from '../helpers/network-guard';
import {seedStudio} from '../helpers/seed-studio';
import {readFile} from 'node:fs/promises';
test('T44 K10 connection configuration export contains saved public addresses but excludes the current ordinary Key',async({page,networkCounter})=>{
 await page.goto('/settings/connections');await page.getByLabel('连接名称',{exact:true}).fill('公开地址');await page.getByLabel('Core 服务地址',{exact:true}).fill('https://public.invalid');await page.getByRole('button',{name:'保存连接地址',exact:true}).click();await expect(page.getByLabel('已保存连接',{exact:true})).not.toHaveValue('');await page.getByLabel('普通用户 Key',{exact:true}).fill('fake-export-forbidden-key');const pending=page.waitForEvent('download');await page.getByRole('button',{name:'导出连接配置',exact:true}).click();const download=await pending,document=JSON.parse(await readFile((await download.path())!,'utf8'));expect(document.connections).toHaveLength(1);expect(document.connections[0].originSnapshot).toBe('https://public.invalid/');expect(JSON.stringify(document)).not.toContain('fake-export-forbidden-key');expect(Object.keys(document)).toEqual(['format','schemaVersion','preferences','connections']);await expect(page.getByLabel('普通用户 Key',{exact:true})).toHaveValue('fake-export-forbidden-key');expect(networkCounter.paidRequests).toHaveLength(0);
});
test('T44 R04 after a content redirect failure retry downloads only the original content; the generation and billing records are unchanged',async({page,networkCounter})=>{
 await page.goto('/tests/fixtures/media-delivery.html');let calls=0;const bytes=await page.evaluate(async()=>{const p='/tests/fixtures/result-review.ts';const blob=await(await import(p)).originalReviewClip(350,'#22c55e');return Array.from(new Uint8Array(await blob.arrayBuffer()));});await page.route('**/core-api/v1/videos/mock-core-1/content',async route=>{calls++;await route.fulfill(calls===1?{status:302,headers:{Location:'https://untrusted.invalid/video'}}:{status:200,contentType:'video/webm',body:Buffer.from(bytes)});});await page.getByRole('button',{name:'下载结果',exact:true}).click();await expect(page.getByRole('status')).toContainText('未核验的下载跳转已阻止');const pending=page.waitForEvent('download');await page.getByRole('button',{name:'重新下载',exact:true}).click();const download=await pending;expect(Array.from(await readFile((await download.path())!))).toEqual(bytes);expect(calls).toBe(2);const stored=await page.evaluate(async()=>{const p='/src/infrastructure/storage/run-repository.ts';return(await import(p)).readRun('media-original-run');});expect(stored).toMatchObject({executionState:'succeeded',billingState:'not_provided',taskId:'mock-core-1'});expect(networkCounter.paidRequests).toHaveLength(0);
});
test('T44 T08 a readable text creates a connected local video draft even before capability verification; undo preserves source and sends no request',async({page,networkCounter})=>{
 await seedStudio(page,'canvas-project');await page.goto('/projects/p1/canvas');await page.getByRole('button',{name:'从文本创建视频流程',exact:true}).click();const dialog=page.getByRole('dialog',{name:'从文本创建视频流程',exact:true});await expect(dialog).toContainText('尚未核验');await dialog.getByRole('button',{name:'确认仅创建草稿',exact:true}).click();await expect(page.locator('[data-node-type="video-generation"]')).toHaveCount(1);await expect(page.getByRole('button',{name:'生成视频',exact:true})).toBeDisabled();const state=await page.evaluate(async()=>{const p='/src/infrastructure/storage/project-repository.ts';return(await import(p)).readGraph('p1');});expect(state.nodes.find((n:{type:string})=>n.type==='text').data.text).toBe('原创镜头');expect(state.edges).toHaveLength(1);expect(state.edges[0]).toMatchObject({sourceId:'text-1',port:'text'});await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(page.locator('[data-node-type="video-generation"]')).toHaveCount(0);await expect(page.getByLabel('节点文本',{exact:true})).toHaveValue('原创镜头');expect(networkCounter.paidRequests).toHaveLength(0);
});
test('QA08: a saved seedance target does not prevent a local text-to-video draft while Core execution is unverified',async({page,networkCounter})=>{
 await seedStudio(page,'canvas-project');await page.evaluate(async()=>{const p='/src/features/settings/preferences-store.ts';(await import(p)).savePreferences({defaultVideoModel:'seedance',defaultDuration:5,defaultRatio:'16:9'});});await page.goto('/projects/p1/canvas');await page.getByRole('button',{name:'从文本创建视频流程',exact:true}).click();await page.getByRole('dialog',{name:'从文本创建视频流程',exact:true}).getByRole('button',{name:'确认仅创建草稿',exact:true}).click();await expect(page.locator('[data-node-type="video-generation"]')).toHaveCount(1);await expect(page.getByRole('button',{name:'生成视频',exact:true})).toBeDisabled();const graph=await page.evaluate(async()=>{const p='/src/infrastructure/storage/project-repository.ts';return(await import(p)).readGraph('p1');});expect(graph.nodes.find((node:{type:string})=>node.type==='video-generation').data.draft).toEqual({modelId:'seedance',durationSeconds:5,ratio:'16:9'});expect(networkCounter.paidRequests).toHaveLength(0);
});
test('QA08: after inserting a local prompt node, applying that prompt to its video source still succeeds',async({page,networkCounter})=>{
 await seedStudio(page,'canvas-project');await page.goto('/projects/p1/canvas');
 await page.getByRole('button',{name:'从文本创建视频流程',exact:true}).click();
 await page.getByRole('dialog',{name:'从文本创建视频流程'}).getByRole('button',{name:'确认仅创建草稿'}).click();
 await expect(page.locator('[data-node-type="video-generation"]')).toHaveCount(1);
 await page.locator('[data-node-type="video-generation"]').getByRole('button',{name:'提示词生成'}).click();
 const panel=page.getByRole('complementary',{name:'提示词生成面板'});
 await panel.getByRole('textbox',{name:'原始创意'}).fill('一只纸飞机飞过窗边，5秒，无对白。');
 await panel.getByRole('spinbutton',{name:'时长目标（秒）'}).fill('5');
 await panel.getByRole('textbox',{name:'画幅目标'}).fill('16:9');
 await panel.getByRole('button',{name:'本地整理'}).click();
 await expect(panel.getByRole('button',{name:'插入画布'})).toBeEnabled();
 await panel.getByRole('button',{name:'插入画布'}).click();
 const insert=page.getByRole('dialog',{name:'选择插入目标'});
 await insert.getByRole('combobox',{name:'目标项目'}).selectOption('p1');
 await expect(insert.getByRole('button',{name:'确认插入文本'})).toBeEnabled();
 await insert.getByRole('button',{name:'确认插入文本'}).click();
 await expect(page.locator('[data-node-type="text"]')).toHaveCount(2);
 await panel.getByRole('button',{name:'应用到源节点'}).click();
 const apply=page.getByRole('dialog',{name:'应用提示词到节点'});
 await apply.getByRole('button',{name:'重新比较'}).click();
 await apply.getByRole('button',{name:'接受并应用'}).click();
 await expect(apply).toHaveCount(0);
 await expect(page.locator('[data-node-type="text"]')).toHaveCount(3);
 expect(networkCounter.paidRequests).toHaveLength(0);
 await page.locator('[data-node-type="video-generation"]').getByRole('button',{name:'提示词生成'}).click();
 await expect(page.getByRole('complementary',{name:'提示词生成面板'}).getByRole('textbox',{name:'原始创意'})).toHaveValue('一只纸飞机飞过窗边，5秒，无对白。');
 await expect(page.getByRole('complementary',{name:'提示词生成面板'})).toContainText('来源画布已更新');
});
