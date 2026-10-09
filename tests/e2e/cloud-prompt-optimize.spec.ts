import {test,expect} from '../helpers/cloud-workspace-ui-fixture';
test('confirms a cloud AI task, recovers its result after reload and reads its immutable input in the task center',async({page,workspace})=>{
 const saved=await workspace.call('PATCH','/studio-api/me/model-configs/text',{...workspace.headers(workspace.account),payload:{apiBase:'https://api.example.test',model:'Vendor/Outside-Catalog',apiKey:'FAKE_CLOUD_UI_KEY',expectedRevision:null}});expect(saved.statusCode).toBe(200);
 await page.goto('/prompt-generator');await page.getByRole('button',{name:'新建视频写作草稿',exact:true}).click();await page.getByLabel('原始创意',{exact:true}).fill('雨后的街道');await page.getByRole('button',{name:'保存写作草稿',exact:true}).click();await expect(page.getByRole('status')).toContainText('草稿已保存');
 await page.getByRole('button',{name:'AI 优化',exact:true}).click();await expect(page.getByRole('dialog',{name:'确认 AI 文字优化',exact:true})).toContainText('Vendor/Outside-Catalog');expect(workspace.providerCalls).toHaveLength(0);
 await page.getByLabel('我确认此文字调用可能收费',{exact:true}).check();await page.getByRole('button',{name:'确认调用文字模型',exact:true}).click();await expect(page.getByRole('status')).toContainText('任务已保存');
 await page.reload();await expect(page.getByLabel('结果正文',{exact:true}).first()).toHaveText('云端 AI 优化的雨后街道');expect(workspace.providerCalls).toHaveLength(1);expect(workspace.providerCalls[0].apiKey).toBe('FAKE_CLOUD_UI_KEY');
 await page.getByRole('link',{name:'任务中心',exact:true}).click();await page.getByRole('button',{name:'查看任务详情',exact:true}).click();await expect(page.getByRole('dialog',{name:'云端任务详情',exact:true})).toContainText('雨后的街道');await expect(page.getByRole('dialog',{name:'云端任务详情',exact:true})).toContainText('已完成');
 await page.screenshot({path:'work/account-api-cloud/cloud-task-detail.png',fullPage:true});
});
test('cancels the text optimization preview without creating or sending a task',async({page,workspace})=>{
 await workspace.call('PATCH','/studio-api/me/model-configs/text',{...workspace.headers(workspace.account),payload:{apiBase:'https://api.example.test',model:'Vendor/Outside-Catalog',apiKey:'FAKE_CLOUD_UI_KEY',expectedRevision:null}});
 await page.goto('/prompt-generator');await page.getByRole('button',{name:'新建视频写作草稿',exact:true}).click();await page.getByLabel('原始创意',{exact:true}).fill('雨后的街道');await page.getByRole('button',{name:'保存写作草稿',exact:true}).click();await expect(page.getByRole('status')).toContainText('草稿已保存');await page.getByRole('button',{name:'AI 优化',exact:true}).click();await page.getByRole('button',{name:'取消',exact:true}).click();expect(workspace.providerCalls).toHaveLength(0);expect((await workspace.pool.query('SELECT count(*)::int n FROM workspace_tasks')).rows[0].n).toBe(0);
});
test('reconciles a completed task when the initial draft read returned an older version',async({page,workspace})=>{
 const release=workspace.holdProvider();try{
  await workspace.call('PATCH','/studio-api/me/model-configs/text',{...workspace.headers(workspace.account),payload:{apiBase:'https://api.example.test',model:'Vendor/Outside-Catalog',apiKey:'FAKE_CLOUD_UI_KEY',expectedRevision:null}});
  await page.goto('/prompt-generator');await page.getByRole('button',{name:'新建视频写作草稿',exact:true}).click();await page.getByLabel('原始创意',{exact:true}).fill('雨后的街道');await page.getByRole('button',{name:'保存写作草稿',exact:true}).click();await expect(page.getByRole('status')).toContainText('草稿已保存');await page.getByRole('button',{name:'AI 优化',exact:true}).click();await page.getByLabel('我确认此文字调用可能收费',{exact:true}).check();await page.getByRole('button',{name:'确认调用文字模型',exact:true}).click();await expect(page.getByRole('status')).toContainText('任务已保存');
  const old=(await workspace.call('GET','/studio-api/prompt-drafts',workspace.headers(workspace.account))).json();expect(old[0].resultVersions).toHaveLength(0);release();await expect.poll(async()=>(await workspace.pool.query("SELECT document->>'executionState' state FROM workspace_tasks")).rows[0]?.state).toBe('succeeded');
  await page.route('http://127.0.0.1:4310/studio-api/prompt-drafts',route=>route.fulfill({status:200,json:old}),{times:1});await page.reload();await expect(page.getByLabel('结果正文',{exact:true})).toHaveText('云端 AI 优化的雨后街道');
 }finally{release();}
});
