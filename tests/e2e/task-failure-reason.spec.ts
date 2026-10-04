import {test,expect} from '../helpers/network-guard';

test('QA32 verified terminal reason remains visible after closing and reopening, with no raw provider text or new POST',async({page,networkCounter})=>{
 await page.route('**/core-api/v1/videos/mock-core-1',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({task:{id:'mock-core-1',status:'failed',error:{code:'video_not_submitted',message:'PROVIDER_PRIVATE_TEXT_DO_NOT_DISPLAY'}},request_id:'query-only-id'})}));
 await page.goto('/tasks');
 await page.evaluate(async()=>{const path='/tests/fixtures/task-history.ts';await (await import(path)).seedTaskHistory();});
 await page.reload();
 await page.evaluate(async()=>{const path='/tests/fixtures/task-history.ts';(await import(path)).connectTaskHistory();});
 const row=page.getByTestId('video-run-1');
 await row.getByRole('button',{name:'详情',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'任务详情',exact:true});
 await dialog.getByRole('button',{name:'重新查询原任务',exact:true}).click();
 await expect(dialog).toContainText('本次辅助步骤已结束，但未提交视频生成');
 await expect(dialog).toContainText('video_not_submitted');
 await expect(dialog).toContainText('账务未提供');
 await expect(dialog).not.toContainText('PROVIDER_PRIVATE_TEXT_DO_NOT_DISPLAY');
 await dialog.getByRole('button',{name:'关闭任务详情',exact:true}).click();
 await row.getByRole('button',{name:'详情',exact:true}).click();
 await expect(dialog).toContainText('本次辅助步骤已结束，但未提交视频生成');
 const state=await page.evaluate(async()=>{const path='/tests/fixtures/task-history.ts';return (await import(path)).taskHistoryState();});
 expect(state.runs.find((run:{id:string})=>run.id==='video-run-1')).toMatchObject({executionState:'failed_confirmed',coreRequestId:'core-original-1',taskId:'mock-core-1',billingState:'not_provided'});
 expect(networkCounter.requests.filter(request=>request.method==='POST')).toHaveLength(0);
});
