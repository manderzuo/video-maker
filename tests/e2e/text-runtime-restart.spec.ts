import {test,expect} from '../helpers/network-guard';
import {f} from '../helpers/fixtures';

test('a readonly memory-Key recheck re-registers a restarted local runtime and preserves its authorization',async({page,networkCounter})=>{
 const profile=f.connection({id:'text-restart',name:'Restart fixture',originSnapshot:'https://text.example.invalid/v1',proxyBase:'/text-api/registered/text-restart',contractVersion:'openai-compatible-text-v1'});
 let registered=false,registrations=0;
 await page.route('**/studio-session.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({nonce:'a'.repeat(64)})}));
 await page.route('**/studio-api/connections',route=>{registered=true;registrations++;expect(route.request().postData()).not.toContain('fake-restart-key');return route.fulfill({contentType:'application/json',body:JSON.stringify({profile})});});
 await page.route('**/text-api/registered/text-restart/v1/models',route=>route.fulfill({status:registered?200:403,contentType:'application/json',body:registered?'{"data":[{"id":"fake-text-only"}]}':'{"error":{"code":"text_target_not_registered"}}'}));
 await page.goto('/settings/connections');await page.getByLabel('文字 API 地址',{exact:true}).fill(profile.originSnapshot);await page.getByLabel('文字 API Key',{exact:true}).fill('fake-restart-key');await page.getByRole('button',{name:'测试文字 API（只读）',exact:true}).click();await page.getByLabel('独立文字模型',{exact:true}).selectOption('fake-text-only');await page.locator('[data-interaction-id="text-api:ack"]').check();await page.getByRole('button',{name:'启用独立文字连接',exact:true}).click();await expect(page.getByLabel('文字 API 状态',{exact:true})).toContainText('已连接');
 const original=await page.evaluate(async()=>{const p='/src/adapters/text/current-text.ts';return(await import(p)).getIndependentText()?.client.binding.id;});
 registered=false;await page.getByRole('button',{name:'测试文字 API（只读）',exact:true}).click();await expect(page.getByLabel('文字 API 状态',{exact:true})).toContainText('已连接');
 expect(registrations).toBe(2);await expect(page.getByLabel('文字 API Key',{exact:true})).toHaveValue('');
 expect(await page.evaluate(async()=>{const p='/src/adapters/text/current-text.ts';return(await import(p)).getIndependentText()?.client.binding.id;})).toBe(original);
 expect(networkCounter.paidRequests).toHaveLength(0);
});
