import {test,expect} from '../helpers/network-guard';
import {localDeployment} from '../helpers/deployment-fixture';
import {f} from '../helpers/fixtures';

test('QA62 a newly registered text API stays connected through automatic checks without reloading or reauthorizing',async({page,networkCounter})=>{
 const profile=f.connection({id:'text-cache',name:'文字登记缓存回归',originSnapshot:'https://text.example.invalid',proxyBase:'/text-api/registered/text-cache',contractVersion:'openai-compatible-text-v1'});
 const entry={profile,contract:{...localDeployment.connections[0].contract,version:profile.contractVersion,textModels:['fake-text-only'],videoModels:[],videoSpecs:[]}};
 let registered=false,catalogCalls=0,registryReads=0;
 await page.clock.install();
 await page.route('**/studio-deployment.json',route=>{registryReads++;return route.fulfill({contentType:'application/json',body:JSON.stringify({...localDeployment,connections:[...localDeployment.connections,...(registered?[entry]:[])]})});});
 await page.route('**/studio-session.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({nonce:'a'.repeat(64)})}));
 await page.route('**/studio-api/connections',route=>{registered=true;expect(route.request().postData()).not.toContain('fake-cache-key');return route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({profile})});});
 await page.route('**/text-api/registered/text-cache/v1/models',route=>{catalogCalls++;return route.fulfill({contentType:'application/json',body:'{"data":[{"id":"fake-text-only"}]}'});});
 await page.goto('/settings/connections');
 await expect.poll(()=>registryReads).toBe(1);
 await page.getByLabel('文字 API 地址',{exact:true}).fill(profile.originSnapshot);
 await page.getByLabel('文字 API Key',{exact:true}).fill('fake-cache-key');
 await page.getByRole('button',{name:'测试文字 API（只读）',exact:true}).click();
 await page.getByLabel('独立文字模型',{exact:true}).selectOption('fake-text-only');
 await page.locator('[data-interaction-id="text-api:ack"]').check();
 await page.getByRole('button',{name:'启用独立文字连接',exact:true}).click();
 const indicator=page.getByLabel('文字 API 连接指示',{exact:true});
 await expect(indicator).toHaveAttribute('data-state','success');
 const binding=await page.evaluate(async()=>{const p='/src/adapters/text/current-text.ts';return(await import(p)).getIndependentText()?.client.binding.id;});
 await page.clock.fastForward(31000);
 await expect.poll(()=>catalogCalls).toBe(2);
 await expect(indicator).toHaveAttribute('data-state','success');
 await page.clock.fastForward(31000);
 await expect.poll(()=>catalogCalls).toBe(3);
 await expect(indicator).toHaveAttribute('data-state','success');
 expect(await page.evaluate(async()=>{const p='/src/adapters/text/current-text.ts';return(await import(p)).getIndependentText()?.client.binding.id;})).toBe(binding);
 await expect(page.getByLabel('文字 API Key',{exact:true})).toHaveValue('');
 expect(networkCounter.paidRequests).toHaveLength(0);
});

test('QA62 reopening settings does not erase the saved default video authorization',async({page,networkCounter})=>{
 let holdRegistry=false,releaseRegistry!:()=>void;
 const registryGate=new Promise<void>(resolve=>releaseRegistry=resolve);
 await page.route('**/studio-deployment.json',async route=>{if(holdRegistry)await registryGate;await route.fulfill({contentType:'application/json',body:JSON.stringify(localDeployment)});});
 await page.route('**/core-api/healthz',route=>route.fulfill({contentType:'application/json',body:'{"status":"ok"}'}));
 await page.route('**/core-api/v1/models',route=>route.fulfill({contentType:'application/json',body:'{"data":[{"id":"fake-video-only"}]}'}));
 await page.goto('/settings/connections');
 await page.getByLabel('连接名称',{exact:true}).fill('默认视频连接');
 await page.getByLabel('Core 服务地址',{exact:true}).fill('https://core.invalid');
 await page.getByRole('button',{name:'保存连接地址',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'连接地址已保存'})).toBeVisible();
 await page.getByLabel('已保存连接',{exact:true}).selectOption({label:'默认视频连接 · https://core.invalid'});
 await expect(page.getByRole('status').filter({hasText:'已选择地址档案'})).toBeVisible();
 await page.getByLabel('普通用户 Key',{exact:true}).fill('fake-default-video-key');
 await page.getByRole('button',{name:'测试连接',exact:true}).click();
 const indicator=page.getByLabel('视频 API 连接指示',{exact:true});
 await expect(indicator).toHaveAttribute('data-state','success');
 const original=await page.evaluate(async()=>{const p='/src/adapters/core/current-connection.ts';return(await import(p)).getActiveCore()?.client.binding.id;});
 holdRegistry=true;
 for(let i=0;i<2;i++){
  await page.reload();
  // Wait for the settings hydration and verify the persisted entry, not just
  // an in-memory authorization that could disappear on the following reload.
  await expect(page.getByRole('status').filter({hasText:'已选择地址档案'})).toBeVisible();
  releaseRegistry();
  await expect(indicator).toHaveAttribute('data-state','success');
  expect(await page.evaluate(async()=>{const p='/src/security/credential-vault.ts';return(await(await import(p)).readCredential('video'))?.binding.id;})).toBe(original);
 }
 expect(networkCounter.paidRequests).toHaveLength(0);
});
