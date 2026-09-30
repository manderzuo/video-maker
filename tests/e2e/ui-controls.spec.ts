import {test,expect} from '../helpers/network-guard';
test('T11 buttons: busy is single flight, disabled reason remains accessible and error notification persists',async({page,networkCounter})=>{
 await page.clock.install();await page.goto('/tests/fixtures/ui.html');
 const button=page.getByRole('button',{name:'开始本地异步操作',exact:true});await button.click();await expect(button).toBeDisabled();await expect(button).toHaveAttribute('aria-busy','true');
 await button.dispatchEvent('click');await button.dispatchEvent('click');await expect(page.getByLabel('操作次数')).toHaveText('1');await page.getByRole('button',{name:'完成操作',exact:true}).click();await expect(button).toBeEnabled();
 await expect(page.getByRole('button',{name:'受控操作',exact:true})).toBeDisabled();await expect(page.getByText('当前服务能力未验证',{exact:true})).toBeVisible();
 await page.clock.fastForward(5000);await expect(page.getByText('保存成功')).not.toBeVisible();await expect(page.getByRole('alert')).toContainText('尚未保存');
 expect(networkCounter.requests.filter(r=>r.method==='POST')).toHaveLength(0);
});
