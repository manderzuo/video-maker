import {randomUUID} from 'node:crypto';
import {test,expect} from '../helpers/cloud-workspace-ui-fixture';
test('confirms a cloud AI task, recovers its result after reload and reads its immutable input in the task center',async({page,workspace})=>{
 const saved=await workspace.call('PATCH','/studio-api/me/model-configs/text',{...workspace.headers(workspace.account),payload:{apiBase:'https://api.example.test',model:'Vendor/Outside-Catalog',apiKey:'FAKE_CLOUD_UI_KEY',expectedRevision:null}});expect(saved.statusCode).toBe(200);
 await page.goto('/prompt-generator');await page.getByRole('button',{name:'新建视频写作草稿',exact:true}).click();await page.getByLabel('原始创意',{exact:true}).fill('雨后的街道');await page.getByRole('button',{name:'保存写作草稿',exact:true}).click();await expect(page.getByRole('status')).toContainText('草稿已保存');
 await page.getByRole('button',{name:'AI 优化',exact:true}).click();await expect(page.getByRole('dialog',{name:'确认 AI 文字优化',exact:true})).toContainText('Vendor/Outside-Catalog');expect(workspace.providerCalls).toHaveLength(0);
 await page.getByLabel('我确认此文字调用可能收费',{exact:true}).check();await page.getByRole('button',{name:'确认调用文字模型',exact:true}).click();await expect(page.getByRole('status')).toContainText('任务已保存');
 await page.reload();await expect(page.getByLabel('结果正文',{exact:true}).first()).toHaveValue('云端 AI 优化的雨后街道');expect(workspace.providerCalls).toHaveLength(1);expect(workspace.providerCalls[0].apiKey).toBe('FAKE_CLOUD_UI_KEY');
 await page.goto('/prompts');await page.getByRole('button',{name:'写作记录',exact:true}).click();const record=page.locator('[data-interaction-id="cloud:prompts:writing-record"]');await expect(record).toHaveCount(1);await expect(record).toContainText('已完成');await expect(record).toContainText('雨后的街道');await record.getByRole('button',{name:'查看结果正文',exact:true}).click();await expect(page.getByRole('dialog',{name:'写作记录结果正文',exact:true})).toContainText('云端 AI 优化的雨后街道');await page.keyboard.press('Escape');
 await page.goto('/tasks');await expect(page.locator('[data-interaction-id="cloud:tasks:scope"]')).toContainText('只呈现视频生成任务');await expect(page.getByRole('button',{name:'查看任务详情',exact:true})).toHaveCount(0);await expect(page.getByText('暂无匹配任务',{exact:true})).toBeVisible();
 await page.screenshot({path:'work/account-api-cloud/cloud-task-detail.png',fullPage:true});
});
test('keeps an unsaved central body when a late AI result arrives and applies the saved version instead',async({page,workspace})=>{
 const release=workspace.holdProvider();try{
  await workspace.call('PATCH','/studio-api/me/model-configs/text',{...workspace.headers(workspace.account),payload:{apiBase:'https://api.example.test',model:'Vendor/Outside-Catalog',apiKey:'FAKE_CLOUD_UI_KEY',expectedRevision:null}});
  await page.goto('/prompt-generator');await page.getByRole('button',{name:'新建视频写作草稿',exact:true}).click();await page.getByLabel('原始创意',{exact:true}).fill('雨后的街道');await page.getByRole('button',{name:'保存写作草稿',exact:true}).click();await page.getByRole('button',{name:'规则整理',exact:true}).click();
  const original=await page.getByLabel('结果正文',{exact:true}).inputValue();expect(original.length).toBeGreaterThan(0);
  await page.getByRole('button',{name:'AI 优化',exact:true}).click();await page.getByLabel('我确认此文字调用可能收费',{exact:true}).check();await page.getByRole('button',{name:'确认调用文字模型',exact:true}).click();await expect(page.getByRole('status')).toContainText('任务已保存');
  await page.getByLabel('结果正文',{exact:true}).fill('等待期间的人工正文');await expect(page.locator('[data-interaction-id="cloud:draft:manual-guard"]')).toBeVisible();await expect(page.getByRole('button',{name:'规则整理',exact:true})).toBeDisabled();await expect(page.getByText('中央正文有未保存修改：请先保存为新的人工结果或明确放弃，再规则整理。',{exact:true})).toBeVisible();
  release();await expect.poll(async()=>(await workspace.pool.query("SELECT document->>'executionState' state FROM workspace_tasks")).rows[0]?.state).toBe('succeeded');await expect(page.getByRole('status')).toContainText('不会被覆盖');await expect(page.getByLabel('结果正文',{exact:true})).toHaveValue('等待期间的人工正文');
  await page.getByRole('button',{name:'保存为新的人工结果',exact:true}).click();await expect(page.getByRole('status')).toContainText('人工结果已保存为新版本');await expect(page.getByLabel('结果正文',{exact:true})).toHaveValue('等待期间的人工正文');
  const versions=(await workspace.pool.query("SELECT document FROM workspace_content WHERE kind='draft'")).rows[0].document.resultVersions as {id:string;origin:string;finalPrompt:string}[];
  expect(versions.map(version=>version.origin)).toEqual(['local','ai','manual']);expect(versions[2].finalPrompt).toBe('等待期间的人工正文');expect(versions[0].finalPrompt).toBe(original);
  const ai=versions.find(version=>version.origin==='ai')!;await page.locator('[data-interaction-id="cloud:draft:version"][value="'+ai.id+'"]').check();await expect(page.getByLabel('结果正文',{exact:true})).toHaveValue(ai.finalPrompt);
  await expect(page.getByLabel('结果正文',{exact:true})).not.toHaveValue('等待期间的人工正文');
  expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(1);
 }finally{release();}
});
test('blocks compile, draft switching and apply while the central body is unsaved and keeps the original AI version',async({page,workspace})=>{
 const headers=workspace.headers(workspace.account),create=async(title:string)=>(await workspace.call('POST','/studio-api/prompt-drafts',{...headers,payload:{type:'video',userRequest:title,sceneId:'text',requestedSpec:{},audioPlan:'',lockedConstraints:[],references:[],ruleVersion:'studio-video-rules-v1',idempotencyKey:randomUUID()}})).json();
 const first=await create('第一份草稿'),second=await create('第二份草稿');
 for(const draft of [first,second])expect((await workspace.call('POST','/studio-api/prompt-drafts/'+draft.id+'/compile',{...headers,payload:{expectedRevision:0}})).statusCode).toBe(200);
 const counts=async()=>((await workspace.pool.query("SELECT document FROM workspace_content WHERE kind='draft'")).rows.map(row=>row.document.resultVersions.length) as number[]).sort();
 await page.goto('/prompt-generator');await expect(page.locator('[data-interaction-id="cloud:draft:select"] option')).toHaveCount(3);
 await expect(page.locator('[data-interaction-id="cloud:draft:manual-guard"]')).toHaveCount(0);
 await page.locator('[data-interaction-id="cloud:draft:select"]').selectOption(first.id);
 await expect(page.locator('[data-interaction-id="cloud:draft:select"]')).toHaveValue(first.id);await expect(page.getByLabel('原始创意',{exact:true})).toHaveValue('第一份草稿');
 const original=await page.getByLabel('结果正文',{exact:true}).inputValue();expect(original.length).toBeGreaterThan(0);
 await page.getByLabel('结果正文',{exact:true}).fill('尚未保存的人工正文');await expect(page.locator('[data-interaction-id="cloud:draft:manual-guard"]')).toBeVisible();
 const before=await counts();await expect(page.getByRole('button',{name:'规则整理',exact:true})).toBeDisabled();await page.getByRole('button',{name:'规则整理',exact:true}).click({force:true});await expect(page.getByLabel('结果正文',{exact:true})).toHaveValue('尚未保存的人工正文');expect(await counts()).toEqual(before);
 await page.locator('[data-interaction-id="cloud:draft:select"]').selectOption(second.id);await expect(page.getByRole('alert')).toContainText('再切换草稿');await expect(page.locator('[data-interaction-id="cloud:draft:select"]')).toHaveValue(first.id);await expect(page.getByLabel('结果正文',{exact:true})).toHaveValue('尚未保存的人工正文');
 await expect(page.getByRole('button',{name:'创建视频流程',exact:true})).toBeDisabled();await page.getByRole('button',{name:'创建视频流程',exact:true}).click({force:true});await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByLabel('结果正文',{exact:true})).toHaveValue('尚未保存的人工正文');
 await page.getByRole('button',{name:'放弃正文修改',exact:true}).click();await expect(page.getByLabel('结果正文',{exact:true})).toHaveValue(original);await expect(page.locator('[data-interaction-id="cloud:draft:manual-guard"]')).toHaveCount(0);
 const versions=(await workspace.pool.query("SELECT document FROM workspace_content WHERE kind='draft'")).rows.flatMap(row=>row.document.resultVersions) as {origin:string}[];
 expect(versions.filter(version=>version.origin==='manual')).toHaveLength(0);expect(versions.filter(version=>version.origin==='ai')).toHaveLength(0);
 await page.locator('[data-interaction-id="cloud:draft:select"]').selectOption(second.id);await expect(page.locator('[data-interaction-id="cloud:draft:select"]')).toHaveValue(second.id);await expect(page.getByLabel('结果正文',{exact:true})).not.toHaveValue('尚未保存的人工正文');
 expect(workspace.providerCalls).toHaveLength(0);
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
  await page.route('http://127.0.0.1:4310/studio-api/prompt-drafts',route=>route.fulfill({status:200,json:old}),{times:1});await page.reload();await expect(page.getByLabel('结果正文',{exact:true})).toHaveValue('云端 AI 优化的雨后街道');
 }finally{release();}
});
