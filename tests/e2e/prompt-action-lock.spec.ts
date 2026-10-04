import {test,expect} from '../helpers/network-guard';

test('QA-020 action prohibition is saved and compiled as an action rule, not a no-cuts camera rule',async({page,networkCounter})=>{
 await page.goto('/prompt-generator');
 await page.evaluate(async()=>{const url='/tests/fixtures/prompt-workspace.ts';await(await import(url)).seedPromptWorkspace();});
 await page.goto('/prompt-generator?type=video&draftId=d1');
 await page.getByRole('textbox',{name:'动作禁止项',exact:true}).fill('不得添加人物或改写品牌汉字');
 await page.getByRole('button',{name:'保存草稿',exact:true}).click();
 await page.getByRole('button',{name:'本地整理',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'最终提示词正文',exact:true})).toHaveValue(/已锁定 forbiddenAction：不得添加人物或改写品牌汉字/);
 await expect(page.getByRole('textbox',{name:'最终提示词正文',exact:true})).not.toHaveValue(/已锁定 noCuts：不得添加人物或改写品牌汉字/);
 expect(networkCounter.paidRequests).toHaveLength(0);
});
