import {test,expect} from '../helpers/network-guard';

test('QA048 refreshing a completed task keeps exactly one queue section and one media section',async({page,networkCounter})=>{
 await page.goto('/tasks');
 await page.evaluate(async()=>{const url='/tests/fixtures/task-history.ts';await (await import(url)).seedTaskHistory();});
 await page.reload();
 await page.getByTestId('video-run-completed').getByRole('button',{name:'详情',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'任务详情',exact:true});
 await expect(dialog).toBeVisible();
 // Exercise three actual periodic reads and React reconciliations, rather than
 // asserting only the initial render that already worked before the fix.
 await page.waitForTimeout(4900);
 await expect(dialog.locator('section[aria-label="原任务本地队列"]')).toHaveCount(1);
 await expect(dialog.locator('section[aria-label="结果内容与下载"]')).toHaveCount(1);
 await dialog.getByRole('button',{name:'重新读取队列',exact:true}).click();
 await expect(dialog.locator('section[aria-label="原任务本地队列"]')).toHaveCount(1);
 expect(networkCounter.paidRequests).toHaveLength(0);
});
