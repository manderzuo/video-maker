import {test,expect} from '../helpers/network-guard';

test.beforeEach(async({page})=>{
 await page.goto('/projects');
 await page.evaluate(async()=>{const path='/tests/fixtures/generation.ts';await(await import(path)).seedGeneration();});
 await page.goto('/projects/p1/canvas');
 await expect(page.getByTestId('node-video-1')).toBeVisible();
});

async function connect(page:import('@playwright/test').Page){await page.evaluate(async()=>{const path='/tests/fixtures/generation.ts';const g=await import(path);g.connectGeneration();const d='/src/infrastructure/storage/database.ts',db=await import(d);await db.withDatabase(undefined,(c:import('../../src/infrastructure/storage/database').StudioDb)=>db.transact(c,['diagnostics'],'readwrite',(tx:IDBTransaction)=>tx.objectStore('diagnostics').put({id:'capability:current',capability:g.generationCaps})));});}

test('video draft opens AI polish with connected text and configured model without media upload or video submit',async({page,networkCounter})=>{
 await connect(page);
 await page.route('**/core-api/v1/chat/completions',route=>{const body=route.request().postDataJSON();expect(body.model).toBe('fake-text-only');expect(JSON.parse(body.messages[1].content).userRequest).toBe('原创确认正文');return route.fulfill({contentType:'application/json',body:JSON.stringify({choices:[{message:{content:JSON.stringify({finalPrompt:'原创确认正文，柔和光线，动作连续',shotPlan:[],improvements:[],warnings:[],suggestedSpec:{durationSeconds:5,ratio:'9:16'}})}}]})});});
 await page.getByTestId('node-video-1').getByRole('button',{name:'AI润色',exact:true}).click();
 await expect(page.getByLabel('最终提示词正文',{exact:true})).toHaveValue('原创确认正文，柔和光线，动作连续');
 expect(networkCounter.paidRequests).toHaveLength(1);expect(networkCounter.paidRequests[0].url).toContain('/chat/completions');
 await page.getByRole('button',{name:'应用到源节点',exact:true}).click();
 await page.getByRole('dialog',{name:'应用提示词到节点'}).getByRole('button',{name:'接受并应用'}).click();
 await expect(page.getByTestId('node-video-1')).toBeVisible();
 await expect(page.getByLabel('节点文本').last()).toHaveValue('原创确认正文，柔和光线，动作连续');
 await expect(page.getByTestId('node-video-1').getByLabel('画幅比例')).toHaveValue('9:16');
 expect(networkCounter.paidRequests).toHaveLength(1);
});

test('missing text authorization has an actionable connection entry for continuation text',async({page,networkCounter})=>{
 const node=page.getByTestId('node-text-1');await expect(node.getByRole('button',{name:'AI润色',exact:true})).toBeDisabled();
 await node.getByRole('button',{name:'连接文字 API',exact:true}).click();
 await expect(page).toHaveURL(/settings\/connections/);expect(networkCounter.paidRequests).toHaveLength(0);
});

test('video prompt generator reads connected text instead of opening an empty continuation',async({page})=>{
 await page.getByTestId('node-video-1').getByRole('button',{name:'提示词生成',exact:true}).click();
 await expect(page.getByLabel('原始创意',{exact:true})).toHaveValue('原创确认正文');
});

test('video selections persist and final execution selections take precedence over prompt specifications',async({page,networkCounter})=>{
 await connect(page);
 await page.evaluate(async()=>{const p='/src/adapters/core/current-connection.ts',m=await import(p),a=m.getActiveCore()!;const caps={...a.capability,videoSpecs:[{modelId:'fake-video-only',durationSeconds:5,ratio:'9:16',resolution:'480p'},{modelId:'fake-video-only',durationSeconds:8,ratio:'16:9',resolution:'720p'}]};m.setActiveCore(a.client,caps);const d='/src/infrastructure/storage/database.ts',db=await import(d);await db.withDatabase(undefined,(c:import('../../src/infrastructure/storage/database').StudioDb)=>db.transact(c,['diagnostics'],'readwrite',(tx:IDBTransaction)=>tx.objectStore('diagnostics').put({id:'capability:current',capability:caps})));});
 await page.getByTestId('node-text-1').getByLabel('节点文本').fill('生成5秒视频，画幅9:16，清晰度480p，猴子和松鼠分享苹果。');
 await page.getByRole('button',{name:'立即保存',exact:true}).click();
 const video=page.getByTestId('node-video-1');await video.getByLabel('时长（秒）').selectOption('8');await expect(video.getByLabel('时长（秒）')).toHaveValue('8');
 await video.getByLabel('画幅比例').selectOption('16:9');await expect(video.getByLabel('画幅比例')).toHaveValue('16:9');
 await video.getByLabel('清晰度').selectOption('720p');await expect(video.getByLabel('清晰度')).toHaveValue('720p');
 await expect.poll(()=>page.evaluate(async()=>{const p='/src/infrastructure/storage/project-repository.ts',m=await import(p),g=await m.readGraph('p1'),n=g?.nodes.find((n:import('../../src/domain/graph').CanvasNode)=>n.id==='video-1');return n?.type==='video-generation'?n.data.draft:undefined;})).toEqual({modelId:'fake-video-only',durationSeconds:8,ratio:'16:9',resolution:'720p'});
 await expect(page.locator('.canvas-heading [role=status]')).toHaveText('已保存');
 await video.getByRole('button',{name:'生成视频',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'生成确认单',exact:true});await expect(dialog).toContainText('8 秒 · 16:9 · 720p');await expect(dialog).toContainText('以视频界面选择为准');
 expect(networkCounter.paidRequests).toHaveLength(0);
 const original=await page.getByTestId('node-text-1').getByLabel('节点文本').inputValue();expect(original).toContain('生成5秒');
 await dialog.getByRole('button',{name:'返回编辑',exact:true}).click();
 await page.reload();await expect(video.getByLabel('时长（秒）')).toHaveValue('8');await expect(video.getByLabel('画幅比例')).toHaveValue('16:9');await expect(video.getByLabel('清晰度')).toHaveValue('720p');
});

test('a real locally extracted tail-frame draft can polish its prompt and apply without losing the image wire',async({page,networkCounter})=>{
 await page.goto('/projects');await page.evaluate(async()=>{const p='/tests/fixtures/result-review.ts';await(await import(p)).seedResultReview();});await page.goto('/projects/p1/results?runId=r1');
 await page.getByRole('button',{name:'尾帧续写',exact:true}).click();const tail=page.getByRole('dialog',{name:'尾帧续写',exact:true});await tail.getByLabel('下一段内容',{exact:true}).fill('猴子与松鼠分享苹果');await tail.getByRole('button',{name:'创建续写草稿',exact:true}).click();
 await expect(page).toHaveURL(/canvas\?node=/);await connect(page);
 await page.route('**/core-api/v1/chat/completions',route=>{const body=route.request().postDataJSON(),input=JSON.parse(body.messages[1].content);expect(input.userRequest).toBe('猴子与松鼠分享苹果');expect(input.scene.title).toBe('视频延长');expect(body.messages[0].content).toContain('不编造上一段');expect(input.references).toEqual([]);return route.fulfill({contentType:'application/json',body:JSON.stringify({choices:[{message:{content:JSON.stringify({finalPrompt:'猴子把苹果分成两份，与松鼠分享，动作连续自然。',shotPlan:[],improvements:[],warnings:[],suggestedSpec:input.requestedSpec})}}]})});});
 const video=page.getByRole('gridcell').filter({has:page.getByRole('button',{name:'编辑标题 尾帧续写视频',exact:true})});await video.getByRole('button',{name:'AI润色',exact:true}).click();await expect(page.getByLabel('最终提示词正文',{exact:true})).toHaveValue('猴子把苹果分成两份，与松鼠分享，动作连续自然。');
 await page.getByRole('button',{name:'应用到源节点',exact:true}).click();await page.getByRole('dialog',{name:'应用提示词到节点'}).getByRole('button',{name:'接受并应用'}).click();
 await expect(video.getByRole('list',{name:'显式参考素材列表'})).toContainText('尾帧参考');await expect(page.getByLabel('节点文本').last()).toHaveValue('猴子把苹果分成两份，与松鼠分享，动作连续自然。');expect(networkCounter.paidRequests).toHaveLength(1);expect(networkCounter.paidRequests[0].url).toContain('/chat/completions');
});

test('locked video and text nodes cannot invoke paid AI polish',async({page,networkCounter})=>{
 await connect(page);await page.getByTestId('node-text-1').getByTestId('node-handle').click();await page.getByRole('button',{name:'锁定选中',exact:true}).click();await expect(page.getByTestId('node-text-1').getByRole('button',{name:'AI润色',exact:true})).toBeDisabled();
 await page.getByTestId('node-video-1').getByTestId('node-handle').click();await page.getByRole('button',{name:'锁定选中',exact:true}).click();await expect(page.getByTestId('node-video-1').getByRole('button',{name:'AI润色',exact:true})).toBeDisabled();expect(networkCounter.paidRequests).toHaveLength(0);
});

test('a readable native tail frame with zero gateway reference support shows one service blocker and preserves its wire without submission',async({page,networkCounter})=>{
 await page.goto('/projects');await page.evaluate(async()=>{const p='/tests/fixtures/result-review.ts';await(await import(p)).seedResultReview();});await page.goto('/projects/p1/results?runId=r1');
 await page.getByRole('button',{name:'尾帧续写',exact:true}).click();const tail=page.getByRole('dialog',{name:'尾帧续写',exact:true});await tail.getByLabel('下一段内容',{exact:true}).fill('猴子与松鼠分享苹果');await tail.getByRole('button',{name:'创建续写草稿',exact:true}).click();await expect(page).toHaveURL(/canvas\?node=/);await connect(page);
 await page.evaluate(async()=>{const p='/src/adapters/core/current-connection.ts',m=await import(p),a=m.getActiveCore()!,cap={...a.capability,limits:{promptBytes:65536,imageReferences:0,videoReferences:0}};m.setActiveCore(a.client,cap);const d='/src/infrastructure/storage/database.ts',db=await import(d);await db.withDatabase(undefined,(c:import('../../src/infrastructure/storage/database').StudioDb)=>db.transact(c,['diagnostics'],'readwrite',(tx:IDBTransaction)=>tx.objectStore('diagnostics').put({id:'capability:current',capability:cap})));});
 const video=page.getByRole('gridcell').filter({has:page.getByRole('button',{name:'编辑标题 尾帧续写视频',exact:true})});await video.getByRole('button',{name:'生成视频',exact:true}).click();const issue=page.getByRole('dialog',{name:'输入无效清单',exact:true});await expect(issue.getByRole('listitem')).toHaveCount(1);await expect(issue).toContainText('网关');await expect(issue).toContainText('图片参考');await expect(issue).not.toContainText('素材大小超限');await expect(page.getByRole('dialog',{name:'生成确认单',exact:true})).not.toBeVisible();await issue.getByRole('button',{name:'关闭',exact:true}).click();await expect(video).toContainText('图片参考尚未开放');await expect(video.getByRole('list',{name:'显式参考素材列表'})).toContainText('尾帧参考');expect(networkCounter.paidRequests).toHaveLength(0);
});
