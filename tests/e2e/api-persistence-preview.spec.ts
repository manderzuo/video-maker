import {test,expect} from '../helpers/network-guard';
import {localDeployment} from '../helpers/deployment-fixture';
import {seedStudio} from '../helpers/seed-studio';
import {f} from '../helpers/fixtures';

test('QA55 verified API survives reload with original binding, without plaintext exports or paid calls',async({page,networkCounter})=>{
 await page.route('**/studio-deployment.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(localDeployment)}));
 await page.route('**/core-api/healthz',route=>route.fulfill({contentType:'application/json',body:'{"status":"ok"}'}));
 await page.route('**/core-api/v1/models',route=>route.fulfill({contentType:'application/json',body:'{"data":[{"id":"fake-text-only"},{"id":"fake-video-only"}]}'}));
 await page.goto('/settings/connections');await page.getByLabel('连接名称',{exact:true}).fill('持久连接');await page.getByLabel('Core 服务地址',{exact:true}).fill('https://core.invalid');await page.getByRole('button',{name:'保存连接地址',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'连接地址已保存'})).toBeVisible();
 await page.getByLabel('普通用户 Key',{exact:true}).fill('fake-persistence-key');await page.getByRole('button',{name:'测试连接',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'健康与模型目录只读核验成功'})).toBeVisible();
 const binding=await page.evaluate(async()=>{const p='/src/adapters/core/current-connection.ts';return(await import(p)).getActiveCore()?.client.binding.id;});
 await expect(page.getByLabel('侧栏 API 连接状态')).toContainText('视频 API');
 await expect.poll(()=>page.evaluate(async()=>{const all=await indexedDB.databases();return all.some(d=>d.name==='aiwork-studio:credentials:v1');})).toBe(true);
 await page.reload();await expect(page.getByRole('button',{name:'测试连接',exact:true})).toBeEnabled();
 await expect.poll(()=>page.evaluate(async()=>{const p='/src/adapters/core/current-connection.ts';return(await import(p)).getActiveCore()?.client.binding.id;})).toBe(binding);
 await expect(page.getByLabel('视频 API 连接指示')).toHaveAttribute('data-state','success');
 const exported=await page.evaluate(async()=>{const path='/src/features/settings/settings-transfer.ts';return (await(await import(path)).exportSettings()).text();});expect(exported).not.toContain('fake-persistence-key');expect(networkCounter.paidRequests).toHaveLength(0);
 await page.getByRole('button',{name:'清除当前 Key',exact:true}).click();await page.reload();await expect(page.getByLabel('视频 API 连接指示')).not.toHaveAttribute('data-state','success');
});

test('QA55 an image asset added to the canvas has an actual decoded inline preview',async({page,networkCounter})=>{
 await seedStudio(page,'canvas-project');await page.evaluate(async()=>{
  const fixture='/tests/helpers/fixtures.ts',database='/src/infrastructure/storage/database.ts',hash='/src/features/assets/hash-worker.ts';const f=(await import(fixture)).f,d=await import(database);
  const canvas=new OffscreenCanvas(120,80),ctx=canvas.getContext('2d')!;ctx.fillStyle='#22c55e';ctx.fillRect(0,0,120,80);const blob=await canvas.convertToBlob({type:'image/png'}),sha256=await(await import(hash)).hashBlob(blob),asset=f.asset({id:'preview-image',title:'预览测试.png',mediaType:'image',mimeType:'image/png',width:120,height:80,bytes:blob.size,sha256,blobKey:'sha256:'+sha256});
  await d.withDatabase(undefined,(db:import('../../src/infrastructure/storage/database').StudioDb)=>d.transact(db,['assets','blobs','graphs'],'readwrite',async(tx:IDBTransaction)=>{tx.objectStore('assets').put(asset);tx.objectStore('blobs').put({id:asset.blobKey,blob});const graph=await d.requestResult(tx.objectStore('graphs').get('p1'));graph.nodes.push({id:'preview-node',type:'asset',title:asset.title,x:450,y:20,locked:false,data:{kind:'asset',assetId:asset.id}});tx.objectStore('graphs').put(graph);}));
 });await page.goto('/projects/p1/canvas');const image=page.getByTestId('node-preview-node').getByRole('img',{name:'预览测试.png',exact:true});await expect(image).toBeVisible();await expect.poll(()=>image.evaluate((el:HTMLImageElement)=>el.naturalWidth)).toBeGreaterThan(0);expect(networkCounter.paidRequests).toHaveLength(0);
});

test('QA55 the queue follows processing and terminal failure from real polling responses without resubmitting',async({page,networkCounter})=>{
 test.setTimeout(30000);await page.goto('/projects');await page.evaluate(async()=>{const path='/tests/fixtures/generation.ts';await(await import(path)).seedGeneration();});await page.goto('/projects/p1/canvas');await page.evaluate(async()=>{const path='/tests/fixtures/generation.ts';(await import(path)).connectGeneration();});
 let status='processing';await page.route('**/core-api/v1/videos/generations',route=>route.fulfill({status:202,contentType:'application/json',body:'{"task":{"id":"mock-live-progress","status":"queued"}}'}));
 await page.route('**/core-api/v1/videos/mock-live-progress',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({task:{id:'mock-live-progress',status,...(status==='failed'?{error:{code:'video_execution_failed'}}:{})}})}));
 await page.getByTestId('node-video-1').getByRole('button',{name:'生成视频',exact:true}).click();const dialog=page.getByRole('dialog',{name:'生成确认单',exact:true});await dialog.getByLabel('我确认以上输入，并知悉可能消耗积分且金额未知').check();await dialog.getByRole('button',{name:'确认提交 1 项',exact:true}).click();
 const queue=page.getByRole('region',{name:'执行队列',exact:true});await expect(queue).toContainText('排队中');await expect(queue).toContainText('生成中',{timeout:12000});await expect(queue).toContainText('最近同步');await expect(queue.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow');
 status='failed';await expect(queue).toContainText('生成失败',{timeout:12000});await expect(queue).toContainText('上游已确认视频生成失败');await expect(queue).not.toContainText('队列已结束');expect(networkCounter.paidRequests).toHaveLength(1);
});

test('QA55 text credentials and model restore automatically, and a failed check turns the sidebar red',async({page,networkCounter})=>{
 const profile=f.connection({id:'remembered-text',name:'持久文字连接',originSnapshot:'https://text.example.invalid',proxyBase:'/text-api/registered/remembered-text',contractVersion:'openai-compatible-text-v1'}),entry={profile,contract:{...localDeployment.connections[0].contract,version:profile.contractVersion,textModels:['fake-text-only'],videoModels:[],videoSpecs:[]}};
 let registered=false;await page.route('**/studio-deployment.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({...localDeployment,connections:[...localDeployment.connections,...(registered?[entry]:[])]})}));await page.route('**/studio-session.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({nonce:'a'.repeat(64)})}));await page.route('**/studio-api/connections',route=>{registered=true;return route.fulfill({contentType:'application/json',body:JSON.stringify({profile})});});
 let connected=true;await page.route('**/text-api/registered/remembered-text/v1/models',route=>route.fulfill({status:connected?200:401,contentType:'application/json',body:connected?'{"data":[{"id":"fake-text-only"}]}':'{"error":{"code":"invalid_api_key"}}'}));
 await page.goto('/settings/connections');await page.getByLabel('文字 API 地址',{exact:true}).fill(profile.originSnapshot);await page.getByLabel('文字 API Key',{exact:true}).fill('fake-remembered-text-key');await page.getByRole('button',{name:'测试文字 API（只读）',exact:true}).click();await page.getByLabel('独立文字模型',{exact:true}).selectOption('fake-text-only');await page.locator('[data-interaction-id="text-api:ack"]').check();await page.getByRole('button',{name:'启用独立文字连接',exact:true}).click();await expect(page.getByLabel('文字 API 连接指示')).toHaveAttribute('data-state','success');
 const binding=await page.evaluate(async()=>{const p='/src/adapters/text/current-text.ts';return(await import(p)).getIndependentText()?.client.binding.id;});registered=false;await page.reload();await expect(page.getByLabel('文字 API 连接指示')).toHaveAttribute('data-state','success');await expect.poll(()=>page.evaluate(async()=>{const p='/src/adapters/text/current-text.ts';return(await import(p)).getIndependentText()?.client.binding.id;})).toBe(binding);
 connected=false;await page.evaluate(async()=>{const p='/src/features/settings/remember-connections.ts';await(await import(p)).checkRememberedConnection('text').catch(()=>{});});await expect(page.getByLabel('文字 API 连接指示')).toHaveAttribute('data-state','failed');
 await page.getByRole('button',{name:'清除文字 Key',exact:true}).click();await page.reload();await expect(page.getByLabel('文字 API 连接指示')).not.toHaveAttribute('data-state','success');expect(networkCounter.paidRequests).toHaveLength(0);
});
