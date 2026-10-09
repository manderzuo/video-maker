import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {test,expect} from '../helpers/cloud-workspace-ui-fixture';
type Version={id:string;origin:string;finalPrompt:string;sourceRevision:number};
type ExportFile={resultVersionId:string;origin:string;finalPrompt:string;sourceRevision:number;source:{userRequest:string}};
const exported=async(download:{path:()=>Promise<string|null>})=>JSON.parse(readFileSync((await download.path())!,'utf8')) as ExportFile;
test('persists complete prompt library metadata and historical text and restores its trash',async({page,workspace})=>{
 await page.goto('/prompts');await page.getByRole('button',{name:'新建提示词',exact:true}).click();await page.getByLabel('提示词名称',{exact:true}).fill('云端运镜');await page.getByLabel('提示词正文',{exact:true}).fill('原来的镜头文字');await page.getByLabel('提示词来源',{exact:true}).fill('我的创作');await page.getByRole('button',{name:'保存提示词',exact:true}).click();await expect(page.getByRole('heading',{name:'云端运镜',exact:true})).toBeVisible();
 await page.reload();await page.getByRole('button',{name:'编辑提示词',exact:true}).click();await page.getByLabel('提示词正文',{exact:true}).fill('改过的镜头文字');await page.getByRole('button',{name:'保存提示词',exact:true}).click();await expect(page.getByText('改过的镜头文字',{exact:true})).toBeVisible();
 const p=(await workspace.pool.query("SELECT document FROM workspace_content WHERE user_id=$1 AND kind='prompt'",[workspace.account.view.user.id])).rows[0].document;expect(p.source).toBe('我的创作');expect((await workspace.call('GET',`/studio-api/prompts/${p.id}/revisions/0`,workspace.headers(workspace.account))).json().body).toBe('原来的镜头文字');
 await page.getByRole('button',{name:'移入提示词回收站',exact:true}).click();await expect(page.getByRole('heading',{name:'云端运镜',exact:true})).toHaveCount(0);await page.goto('/trash');await page.getByRole('button',{name:'恢复提示词',exact:true}).click();await expect(page.getByRole('heading',{name:'云端运镜',exact:true})).toHaveCount(0);await page.goto('/prompts');await expect(page.getByRole('heading',{name:'云端运镜',exact:true})).toBeVisible();
});
test('retains video writing input, local results and historical input snapshots after reload',async({page,workspace})=>{
 await page.goto('/prompt-generator');await page.getByRole('button',{name:'新建视频写作草稿',exact:true}).click();await page.getByLabel('原始创意',{exact:true}).fill('雨后的城市，一镜到底');await page.getByLabel('声音策略',{exact:true}).fill('只保留环境声');await page.getByRole('button',{name:'保存写作草稿',exact:true}).click();await expect(page.getByRole('status')).toContainText('草稿已保存');
 await page.getByRole('button',{name:'规则整理',exact:true}).click();await expect(page.getByLabel('结果正文',{exact:true})).toHaveValue(/雨后的城市/);await page.reload();await expect(page.getByLabel('原始创意',{exact:true})).toHaveValue('雨后的城市，一镜到底');await expect(page.getByLabel('结果正文',{exact:true})).toHaveValue(/雨后的城市/);
 await page.getByRole('button',{name:'查看输入快照',exact:true}).click();await expect(page.getByRole('dialog',{name:'历史输入快照',exact:true})).toContainText('只保留环境声');
 const rows=(await workspace.pool.query("SELECT document FROM workspace_content WHERE user_id=$1 AND kind='draft'",[workspace.account.view.user.id])).rows;expect(rows).toHaveLength(1);expect(rows[0].document.resultVersions).toHaveLength(1);
 await page.keyboard.press('Escape');
 await page.getByLabel('结果正文',{exact:true}).fill('人工修订后的完整正文');await page.getByRole('button',{name:'保存为新的人工结果',exact:true}).click();await expect(page.getByRole('status')).toContainText('人工结果已保存为新版本');await expect(page.getByLabel('结果正文',{exact:true})).toHaveValue('人工修订后的完整正文');
 const stored=(await workspace.pool.query("SELECT document FROM workspace_content WHERE kind='draft'")).rows[0].document;expect(stored.resultVersions.map((version:{origin:string})=>version.origin)).toEqual(['local','manual']);expect(stored.resultVersions[0].finalPrompt).toContain('雨后的城市');
 await page.getByRole('button',{name:'保存到提示词库',exact:true}).click();await page.getByLabel('提示词名称',{exact:true}).fill('人工修订结果');await page.getByRole('button',{name:'保存到提示词库',exact:true}).last().click();await expect(page.getByRole('status')).toContainText('已保存到提示词库');
 const entry=(await workspace.pool.query("SELECT document FROM workspace_content WHERE kind='prompt'")).rows[0].document;expect(entry.title).toBe('人工修订结果');expect(entry.body).toBe('人工修订后的完整正文');expect(entry.draftId).toBe(stored.id);expect(entry.resultVersionId).toBe(stored.resultVersions[1].id);
 await page.context().grantPermissions(['clipboard-write']);await page.getByRole('button',{name:'复制正文',exact:true}).click();await expect(page.getByRole('status')).toContainText('已复制正文');
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'导出 JSON',exact:true}).click();expect((await download).suggestedFilename()).toBe('AIWORK-写作结果.json');await expect(page.getByRole('status')).toContainText('已触发浏览器下载');
});
test('keeps every out-of-preset legacy writing value visible and requires an explicit choice',async({page,workspace})=>{
 const draft=(await workspace.call('POST','/studio-api/prompt-drafts',{...workspace.headers(workspace.account),payload:{type:'video',userRequest:'旧草稿规格',sceneId:'text',requestedSpec:{durationSeconds:3,ratio:'21:9'},audioPlan:'',lockedConstraints:[],references:[],ruleVersion:'studio-video-rules-v1',idempotencyKey:randomUUID()}})).json();
 await page.goto('/prompt-generator');await page.locator('[data-interaction-id="cloud:draft:select"]').selectOption(draft.id);
 const duration=page.locator('[data-interaction-id="PG10"]'),ratio=page.locator('[data-interaction-id="ui:PromptForm:input:a944108bfffb"]');
 await expect(page.locator('[data-interaction-id="PG10:out-of-preset"]')).toContainText('3 秒');await expect(page.locator('[data-interaction-id="ui:PromptForm:input:a944108bfffb:out-of-preset"]')).toContainText('21:9');
 await expect(duration).toHaveValue('3');await expect(ratio).toHaveValue('21:9');
 expect(await duration.locator('option').allTextContents()).toHaveLength(12);expect(await ratio.locator('option').allTextContents()).toEqual(['原值 21:9 · 超出预设，请明确修改','16:9','9:16','1:1','4:3','3:4']);
 for(const seconds of [5,6,7,8,9,10,11,12,13,14,15])await expect(duration.locator('option[value="'+seconds+'"]')).toHaveCount(1);
 await page.getByRole('button',{name:'保存写作草稿',exact:true}).click();await expect(page.getByRole('status')).toContainText('草稿已保存');
 const unchanged=(await workspace.pool.query("SELECT document FROM workspace_content WHERE kind='draft'")).rows[0].document;expect(unchanged.requestedSpec).toEqual({durationSeconds:3,ratio:'21:9'});
 await duration.selectOption('15');await ratio.selectOption('9:16');await page.getByRole('button',{name:'保存写作草稿',exact:true}).click();await expect(page.locator('[data-interaction-id="PG10:out-of-preset"]')).toHaveCount(0);await expect(page.locator('[data-interaction-id="ui:PromptForm:input:a944108bfffb:out-of-preset"]')).toHaveCount(0);
 const updated=(await workspace.pool.query("SELECT document FROM workspace_content WHERE kind='draft'")).rows[0].document;expect(updated.requestedSpec).toEqual({durationSeconds:15,ratio:'9:16'});
 expect(workspace.providerCalls).toHaveLength(0);
});
test('opens the exact writing record instead of the list head and never silently falls back',async({page,workspace})=>{
 const headers=workspace.headers(workspace.account),titles:Record<string,string>={};
 for(const title of ['较早的写作草稿','较新的写作草稿']){
  const draft=(await workspace.call('POST','/studio-api/prompt-drafts',{...headers,payload:{type:'video',userRequest:title,sceneId:'text',requestedSpec:{},audioPlan:'',lockedConstraints:[],references:[],ruleVersion:'studio-video-rules-v1',idempotencyKey:randomUUID()}})).json();
  titles[draft.id]=title;expect((await workspace.call('POST','/studio-api/prompt-drafts/'+draft.id+'/compile',{...headers,payload:{expectedRevision:0}})).statusCode).toBe(200);
 }
 const listed=(await workspace.call('GET','/studio-api/prompt-drafts',headers)).json() as {id:string;resultVersions:Version[]}[];expect(listed).toHaveLength(2);
 const target=listed[1],body=target.resultVersions[0].finalPrompt;
 await page.goto('/prompts');await page.getByRole('button',{name:'写作记录',exact:true}).click();
 const records=page.locator('[data-interaction-id="cloud:prompts:writing-record"]');await expect(records).toHaveCount(2);
 await records.filter({hasText:titles[target.id]}).getByRole('button',{name:'打开写作草稿',exact:true}).click();
 await expect(page.locator('[data-interaction-id="cloud:draft:select"]')).toHaveValue(target.id);await expect(page.getByLabel('原始创意',{exact:true})).toHaveValue(titles[target.id]);await expect(page.getByLabel('结果正文',{exact:true})).toHaveValue(body);
 await page.reload();await expect(page.locator('[data-interaction-id="cloud:draft:select"]')).toHaveValue(target.id);await expect(page.getByLabel('结果正文',{exact:true})).toHaveValue(body);
 await page.goto('/prompt-generator?draft='+randomUUID());await expect(page.getByRole('alert')).toContainText('不存在或不属于当前账号');await expect(page.locator('[data-interaction-id="cloud:draft:select"]')).toHaveValue('');await expect(page.getByLabel('结果正文',{exact:true})).toHaveCount(0);
 expect(workspace.providerCalls).toHaveLength(0);
});
test('keeps exported and library provenance equal to the persisted result version',async({page,workspace})=>{
 const headers=workspace.headers(workspace.account);
 const draft=(await workspace.call('POST','/studio-api/prompt-drafts',{...headers,payload:{type:'video',userRequest:'导出旧来源',sceneId:'text',requestedSpec:{},audioPlan:'只保留环境声',lockedConstraints:[],references:[],ruleVersion:'studio-video-rules-v1',idempotencyKey:randomUUID()}})).json();
 expect((await workspace.call('POST','/studio-api/prompt-drafts/'+draft.id+'/compile',{...headers,payload:{expectedRevision:0}})).statusCode).toBe(200);
 await page.goto('/prompt-generator?draft='+draft.id);
 const local=((await workspace.pool.query("SELECT document FROM workspace_content WHERE kind='draft'")).rows[0].document.resultVersions as Version[])[0];
 await page.context().grantPermissions(['clipboard-write']);await page.getByLabel('结果正文',{exact:true}).fill('未保存的人工正文');
 await expect(page.getByRole('button',{name:'导出 JSON',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'保存到提示词库',exact:true})).toBeDisabled();
 await expect(page.getByText('中央正文有未保存修改：请先保存为新的人工结果，再导出，避免正文与版本来源不一致。',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'保存为新的人工结果',exact:true}).click();await expect(page.getByRole('status')).toContainText('人工结果已保存为新版本');
 const versions=(await workspace.pool.query("SELECT document FROM workspace_content WHERE kind='draft'")).rows[0].document.resultVersions as Version[],manual=versions[versions.length-1];expect(manual.origin).toBe('manual');expect(manual.finalPrompt).toBe('未保存的人工正文');
 const first=page.waitForEvent('download');await page.getByRole('button',{name:'导出 JSON',exact:true}).click();const file=await exported(await first);
 expect(file).toMatchObject({resultVersionId:manual.id,origin:'manual',finalPrompt:'未保存的人工正文',sourceRevision:manual.sourceRevision});expect(file.source.userRequest).toBe('导出旧来源');
 await page.getByRole('button',{name:'保存到提示词库',exact:true}).click();await page.getByRole('button',{name:'保存到提示词库',exact:true}).last().click();await expect(page.getByRole('status')).toContainText('已保存到提示词库');
 const entry=(await workspace.pool.query("SELECT document FROM workspace_content WHERE kind='prompt'")).rows[0].document;expect(entry.body).toBe('未保存的人工正文');expect(entry.resultVersionId).toBe(manual.id);expect(entry.draftId).toBe(draft.id);
 await page.locator('[data-interaction-id="cloud:draft:version"][value="'+local.id+'"]').check();await page.getByLabel('原始创意',{exact:true}).fill('改写后的新来源');await page.getByRole('button',{name:'保存写作草稿',exact:true}).click();await expect(page.getByRole('status')).toContainText('草稿已保存');
 await expect(page.getByRole('button',{name:'导出 JSON',exact:true})).toBeEnabled();const second=page.waitForEvent('download');await page.getByRole('button',{name:'导出 JSON',exact:true}).click();const older=await exported(await second);
 expect(older).toMatchObject({resultVersionId:local.id,finalPrompt:local.finalPrompt,sourceRevision:local.sourceRevision});expect(older.source.userRequest).toBe('导出旧来源');expect(older.source.userRequest).not.toBe('改写后的新来源');
 const current=(await workspace.call('GET','/studio-api/prompt-drafts/'+draft.id,headers)).json();expect(current.userRequest).toBe('改写后的新来源');expect(current.resultVersions).toHaveLength(2);
 expect(workspace.providerCalls).toHaveLength(0);
});
test('rejects stale draft writes while preserving typed input and never reads anonymous IndexedDB',async({page,workspace})=>{
 await page.addInitScript(()=>{Object.defineProperty(window,'indexedDB',{get(){throw new Error('LEGACY_DB_MUST_NOT_OPEN');}});});
 await page.goto('/prompt-generator');await page.getByRole('button',{name:'新建视频写作草稿',exact:true}).click();await expect(page.getByLabel('原始创意',{exact:true})).toBeVisible();const d=(await workspace.pool.query("SELECT document FROM workspace_content WHERE kind='draft'")).rows[0].document;
 const changed=await workspace.call('PATCH',`/studio-api/prompt-drafts/${d.id}`,{...workspace.headers(workspace.account),payload:{expectedRevision:0,userRequest:'来自另一设备'}});expect(changed.statusCode).toBe(200);
 await page.getByLabel('原始创意',{exact:true}).fill('本页未保存的创意');await page.getByRole('button',{name:'保存写作草稿',exact:true}).click();await expect(page.getByRole('alert')).toContainText('另一设备');await expect(page.getByLabel('原始创意',{exact:true})).toHaveValue('本页未保存的创意');
});
