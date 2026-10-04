import {test,expect} from '../helpers/network-guard';
import type {Page} from '@playwright/test';
import {holdNextNativeCommit,nativeCommitProbe,releaseNativeCommit} from '../helpers/native-commit-hold';

const state=(page:Page)=>page.evaluate(async()=>{
 const url='/tests/fixtures/prompt-workspace.ts';
 return (await import(url)).promptWorkspaceState();
});
test.beforeEach(async({page})=>{
 await page.goto('/prompt-generator');
 await page.evaluate(async()=>{const url='/tests/fixtures/prompt-workspace.ts';await (await import(url)).seedPromptWorkspace();});
 await page.goto('/prompt-generator?type=video&draftId=d1');
});

test('QA045 zero duration identifies the invalid field and preserves saved data instead of claiming a storage failure',async({page,networkCounter})=>{
 const before=await state(page);
 await page.getByRole('spinbutton',{name:'时长目标（秒）',exact:true}).fill('0');
 await page.getByRole('button',{name:'保存草稿',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('时长');
 await expect(page.getByRole('alert')).not.toContainText('存储空间');
 await expect(page.getByRole('spinbutton',{name:'时长目标（秒）',exact:true})).toHaveValue('0');
 expect(await state(page)).toEqual(before);
 await page.getByRole('spinbutton',{name:'时长目标（秒）',exact:true}).fill('5');
 await page.getByRole('button',{name:'保存草稿',exact:true}).click();
 expect((await state(page)).drafts[0].requestedSpec.durationSeconds).toBe(5);
 await expect(page.getByRole('alert')).toHaveCount(0);
 expect(networkCounter.paidRequests).toHaveLength(0);
});

async function openConflict(page:Page){
 await page.getByRole('textbox',{name:'原始创意',exact:true}).fill('QA046原确认需求：一个人物，10秒，9:16。');
 await page.getByRole('spinbutton',{name:'时长目标（秒）',exact:true}).fill('5');
 await page.getByRole('textbox',{name:'画幅目标',exact:true}).fill('16:9');
 await page.getByRole('button',{name:'本地整理',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'确认需求与表单冲突',exact:true});
 await expect(dialog).toBeVisible();
 await dialog.getByRole('combobox',{name:'时长采用值',exact:true}).selectOption('5');
 await dialog.getByRole('combobox',{name:'画幅采用值',exact:true}).selectOption('16:9');
 return dialog;
}

test('QA046 an edit while conflict confirmation is saving prevents compiling unrelated new input',async({page,networkCounter})=>{
 const dialog=await openConflict(page),before=await state(page);
 await holdNextNativeCommit(page,'promptDrafts');
 await dialog.getByRole('button',{name:'采用所选值',exact:true}).click();
 await expect.poll(()=>nativeCommitProbe(page)).toMatchObject({nativeCommitted:true,awaitingDelivery:true});
 await page.getByRole('textbox',{name:'原始创意',exact:true}).fill('QA046确认后新编辑：三个角色，新的故事。');
 await releaseNativeCommit(page);
 await expect(page.getByRole('alert')).toContainText('需求已变化');
 await expect(page.getByRole('textbox',{name:'原始创意',exact:true})).toHaveValue('QA046确认后新编辑：三个角色，新的故事。');
 expect((await state(page)).drafts[0].resultVersions).toEqual(before.drafts[0].resultVersions);
 expect(networkCounter.paidRequests).toHaveLength(0);
});

test('QA046 unchanged conflict choices compile the explicitly confirmed writing request locally',async({page,networkCounter})=>{
 const dialog=await openConflict(page);
 await dialog.getByRole('button',{name:'采用所选值',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'最终提示词正文',exact:true})).toHaveValue(/QA046原确认需求/);
 await expect.poll(async()=> (await state(page)).drafts[0].resultVersions.length).toBeGreaterThan(0);
 const draft=(await state(page)).drafts[0],result=draft.resultVersions.at(-1)!;
 expect(result.suggestedSpec).toEqual({durationSeconds:5,ratio:'16:9'});
 expect(result.origin).toBe('local');
 expect(networkCounter.paidRequests).toHaveLength(0);
});
