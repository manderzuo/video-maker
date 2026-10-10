import {test,expect} from '../helpers/account-api-ui-fixture';
const card=(page:import('@playwright/test').Page,channel:'video'|'text')=>page.getByRole('region',{name:channel==='video'?'视频 API':'文字 API',exact:true});
test('shared cards have three fields / three actions, video first, with address-key-model order for text',async({page})=>{
 await page.goto('/welcome');await expect(page).toHaveURL(/\/settings\/connections$/);await expect(page.getByRole('link',{name:'使用引导',exact:true})).toHaveCount(0);const video=card(page,'video'),text=card(page,'text');await expect(video).toBeVisible();await expect(text).toBeVisible();
 for(const panel of [video,text]){await expect(panel.locator('input')).toHaveCount(3);await expect(panel.getByRole('button')).toHaveCount(3);await expect(panel.getByRole('button',{name:'测试连接',exact:true})).toBeVisible();await expect(panel.getByRole('button',{name:'保存',exact:true})).toBeVisible();await expect(panel.getByRole('button',{name:'展开模型列表',exact:true})).toBeVisible();}
 expect(await video.locator('input').evaluateAll(inputs=>inputs.map(input=>input.getAttribute('data-field')))).toEqual(['apiBase','model','apiKey']);expect(await text.locator('input').evaluateAll(inputs=>inputs.map(input=>input.getAttribute('data-field')))).toEqual(['apiBase','apiKey','model']);await expect(page.getByRole('button',{name:'进入工作台',exact:true})).toHaveCount(0);await expect(page.getByText('进入本地模式',{exact:true})).toHaveCount(0);
});
test('text tests without model; unavailable catalog permits manual save; saved key remains an empty input',async({page,apiModel})=>{
 apiModel.catalogStatus='unavailable';apiModel.connection='unknown';apiModel.models=[];await page.goto('/welcome');const text=card(page,'text');await text.getByLabel('地址',{exact:true}).fill('https://fake.example/api');await text.getByLabel('密钥',{exact:true}).fill('FAKE_UI_KEY');await text.getByRole('button',{name:'测试连接',exact:true}).click();await expect(text.getByRole('status')).toContainText('可手动填写');expect(apiModel.probes[0].input).not.toHaveProperty('model');expect(apiModel.configWrites).toHaveLength(0);
 await text.getByLabel('模型名称',{exact:true}).fill('Vendor/Unlisted');await text.getByRole('button',{name:'保存',exact:true}).click();await expect(text.getByText('已保存到当前账号',{exact:false})).toBeVisible();await expect(text.getByLabel('密钥',{exact:true})).toHaveValue('');await expect(text.getByLabel('密钥',{exact:true})).toHaveAttribute('placeholder','已保存；留空继续使用');expect(apiModel.configs[0].model).toBe('Vendor/Unlisted');await expect(text).not.toContainText('生成成功');
});
test('settings and welcome reload the same saved values, retain typed model on retest and keep text controls visible',async({page,apiModel})=>{
 apiModel.configs=[{channel:'text',apiBase:'https://fake.example/api',model:'Vendor/Manual',revision:1,hasKey:true}];await page.goto('/welcome');const text=card(page,'text');await expect(text.getByLabel('模型名称',{exact:true})).toHaveValue('Vendor/Manual');await text.getByRole('button',{name:'测试连接',exact:true}).click();await text.getByLabel('模型名称',{exact:true}).fill('');await expect(text.getByRole('option')).toHaveCount(1);await text.getByRole('option',{name:'Vendor/Listed',exact:true}).click();await expect(text.getByLabel('模型名称',{exact:true})).toHaveValue('Vendor/Listed');
 await page.getByRole('link',{name:'设置',exact:true}).click();await expect(page).toHaveURL(/\/settings\/connections$/);await expect(card(page,'text').getByLabel('模型名称',{exact:true})).toHaveValue('Vendor/Listed');await card(page,'text').getByLabel('模型名称',{exact:true}).fill('Vendor/FromSettings');await card(page,'text').getByRole('button',{name:'保存',exact:true}).click();await expect(card(page,'text').getByText('已保存到当前账号',{exact:false})).toBeVisible();await page.getByRole('link',{name:'项目',exact:true}).click();await expect(page).toHaveURL(/\/projects$/);await page.getByRole('link',{name:'设置',exact:true}).click();await expect(card(page,'text').getByLabel('模型名称',{exact:true})).toHaveValue('Vendor/FromSettings');
});
test('Chinese composition Enter does not submit; only the save button makes a request',async({page,apiModel})=>{
 await page.goto('/settings/connections');const text=card(page,'text');await text.getByLabel('地址',{exact:true}).fill('https://fake.example');await text.getByLabel('密钥',{exact:true}).fill('FAKE_UI_KEY');const model=text.getByLabel('模型名称',{exact:true});await model.fill('供应商/模型');await model.dispatchEvent('compositionstart');await model.dispatchEvent('keydown',{key:'Enter',code:'Enter',isComposing:true});await model.dispatchEvent('compositionend');await model.press('Enter');expect(apiModel.configWrites).toHaveLength(0);expect(apiModel.probes).toHaveLength(0);await text.getByRole('button',{name:'保存',exact:true}).click();await expect(text.getByText('已保存到当前账号',{exact:false})).toBeVisible();expect(apiModel.configWrites).toHaveLength(1);
});
test('save conflict and failure retain entered credentials until explicit reload',async({page,apiModel})=>{
 apiModel.configs=[{channel:'text',apiBase:'https://fake.example',model:'Vendor/Saved',revision:1,hasKey:true}];await page.goto('/settings/connections');const text=card(page,'text');await text.getByLabel('模型名称',{exact:true}).fill('Vendor/Unsaved');await text.getByLabel('密钥',{exact:true}).fill('FAKE_UI_UNSAVED');apiModel.conflictNextSave=true;await text.getByRole('button',{name:'保存',exact:true}).click();await expect(text.getByRole('alert')).toContainText('输入已保留');await expect(text.getByLabel('模型名称',{exact:true})).toHaveValue('Vendor/Unsaved');await expect(text.getByLabel('密钥',{exact:true})).toHaveValue('FAKE_UI_UNSAVED');await page.getByRole('button',{name:'重新加载两项配置',exact:true}).click();await expect(text.getByLabel('模型名称',{exact:true})).toHaveValue('Vendor/Saved');await expect(text.getByLabel('密钥',{exact:true})).toHaveValue('');apiModel.failNextSave=true;await text.getByLabel('模型名称',{exact:true}).fill('Vendor/Keep');await text.getByRole('button',{name:'保存',exact:true}).click();await expect(text.getByRole('alert')).toBeVisible();await expect(text.getByLabel('模型名称',{exact:true})).toHaveValue('Vendor/Keep');
});
test('an auto probe cleared by an address change cannot restore catalog; saving then requires a key',async({page,apiModel})=>{
 apiModel.configs=[{channel:'text',apiBase:'https://fake.example',model:'Vendor/Saved',revision:1,hasKey:true}];let release!:()=>void;apiModel.probeGate=new Promise<void>(resolve=>{release=resolve;});try{
  await page.goto('/settings/connections');const text=card(page,'text');await expect.poll(()=>apiModel.probes.length).toBe(1);await text.getByLabel('地址',{exact:true}).fill('https://other.fake.example');release();await text.getByRole('button',{name:'保存',exact:true}).click();await expect(text.getByRole('alert')).toContainText('密钥');await text.getByRole('button',{name:'展开模型列表',exact:true}).click();await expect(text.getByText('暂无目录结果',{exact:false})).toBeVisible();expect(apiModel.configWrites).toHaveLength(0);
 }finally{release();}
});
test('account switch discards A draft and late results before showing B configurations',async({page,apiModel})=>{
 apiModel.configs=[{channel:'text',apiBase:'https://fake.example',model:'A/Model',revision:1,hasKey:true}];let release!:()=>void;apiModel.probeGate=new Promise<void>(resolve=>{release=resolve;});try{
  await page.goto('/welcome');const text=card(page,'text');await text.getByLabel('密钥',{exact:true}).fill('FAKE_A_DRAFT_KEY');await text.getByRole('button',{name:'测试连接',exact:true}).click();await expect.poll(()=>apiModel.probes.length).toBe(2);apiModel.session={...apiModel.session,user:{id:'22222222-2222-4222-8222-222222222222',username:'Fake_Task3_B'},contextId:'c'.repeat(43),csrfToken:'d'.repeat(43)};apiModel.configs=[{channel:'text',apiBase:'https://fake-b.example',model:'B/Model',revision:1,hasKey:true}];await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.getByTitle('当前账号：Fake_Task3_B',{exact:true})).toBeVisible();await expect(card(page,'text').getByLabel('模型名称',{exact:true})).toHaveValue('B/Model');release();await expect(card(page,'text').getByLabel('密钥',{exact:true})).toHaveValue('');
  // 切换后对B已保存配置做去重只读检测：不带出密钥，结果归B所有
  const switched=card(page,'text');await switched.getByLabel('模型名称',{exact:true}).fill('');await expect(switched.getByRole('option')).toHaveCount(1);
  expect(apiModel.probes.at(-1)).toMatchObject({channel:'text'});expect(apiModel.probes.at(-1)!.input).not.toHaveProperty('apiKey');
 }finally{release();}
});
test('first login lands on projects without a guide gate; empty config offers the settings entry',async({page,apiModel})=>{
 await page.goto('/');await expect(page).toHaveURL(/\/projects$/);expect(apiModel.onboardingWrites).toEqual([]);expect(apiModel.probes).toHaveLength(0);expect(apiModel.configWrites).toHaveLength(0);await expect(page.getByRole('heading',{name:'项目',exact:true})).toBeVisible();await expect(page.getByText('还没有项目',{exact:true})).toBeVisible();await expect(page.locator('.canvas-shell')).toHaveCount(0);
 await page.getByRole('link',{name:'设置',exact:true}).click();await expect(page).toHaveURL(/\/settings\/connections$/);await expect(page.getByRole('link',{name:'使用引导',exact:true})).toHaveCount(0);
});
test('both themes at 1440/1280/1024/720 keep fields visible, targets 44px and cards follow the width boundary',async({page,apiModel},testInfo)=>{
 for(const theme of ['dark','light'] as const){apiModel.document.preferences.theme=theme;for(const width of [1440,1280,1024,720]){
  await page.setViewportSize({width,height:1100});await page.goto('/welcome');const video=card(page,'video'),text=card(page,'text');await expect(text).toBeVisible();const v=await video.boundingBox(),t=await text.boundingBox();if(!v||!t)throw new Error('Missing cards');if(width>=1024)expect(Math.abs(v.y-t.y)).toBeLessThan(2);else expect(t.y).toBeGreaterThan(v.y+v.height-2);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);const sizes=await page.locator('.api-settings-panel input,.api-settings-panel button').evaluateAll(controls=>controls.map(control=>control.getBoundingClientRect().height));expect(sizes.every(height=>height>=44)).toBe(true);await page.screenshot({path:testInfo.outputPath(`task3-${theme}-${width}.png`),fullPage:true});
 }}
});
test('success shows the model count, save keeps it visible, and key change drops the stale success',async({page})=>{
 await page.goto('/settings/connections');const text=card(page,'text');
 await text.getByLabel('地址',{exact:true}).fill('https://fake.example/api');await text.getByLabel('密钥',{exact:true}).fill('FAKE_UI_KEY');
 await text.getByRole('button',{name:'测试连接',exact:true}).click();
 await expect(text.getByRole('status')).toContainText('连接成功 · 已获取 1 个模型');
 await text.getByLabel('模型名称',{exact:true}).fill('Vendor/Listed');
 await text.getByRole('button',{name:'保存',exact:true}).click();
 await expect(text.getByText('已保存到当前账号',{exact:false})).toBeVisible();
 await expect(text.getByText('连接成功 · 已获取 1 个模型',{exact:false})).toBeVisible();
 await text.getByLabel('密钥',{exact:true}).fill('FAKE_CHANGED_KEY');
 await expect(text.getByRole('status')).toContainText('尚未检测');
 await expect(text).not.toContainText('连接成功');
});
test('failed probe reports a permission error and unknown catalog is never shown as success',async({page,apiModel})=>{
 apiModel.connection='failed';apiModel.catalogStatus='failed';apiModel.models=[];apiModel.failure='denied';
 await page.goto('/settings/connections');const text=card(page,'text');
 await text.getByLabel('地址',{exact:true}).fill('https://fake.example/api');await text.getByLabel('密钥',{exact:true}).fill('FAKE_BAD_KEY');
 await text.getByRole('button',{name:'测试连接',exact:true}).click();
 await expect(text.getByRole('status')).toContainText('权限或密钥错误');
 apiModel.connection='unknown';apiModel.catalogStatus='unavailable';
 await text.getByRole('button',{name:'测试连接',exact:true}).click();
 await expect(text.getByRole('status')).toContainText('连接状态未确认');
 await expect(text.getByRole('status')).not.toContainText('连接成功');
});
test('a long catalog can be searched and its tail model selected, then saved exactly',async({page,apiModel})=>{
 apiModel.models=Array.from({length:30},(_,index)=>'Vendor/Tail-'+String(index).padStart(2,'0'));
 await page.goto('/settings/connections');const text=card(page,'text');
 await text.getByLabel('地址',{exact:true}).fill('https://fake.example/api');await text.getByLabel('密钥',{exact:true}).fill('FAKE_UI_KEY');
 await text.getByRole('button',{name:'测试连接',exact:true}).click();
 await expect(text.getByRole('status')).toContainText('已获取 30 个模型');
 await text.getByRole('button',{name:'展开模型列表',exact:true}).click();
 await expect(text.getByRole('option')).toHaveCount(30);
 await text.getByLabel('模型名称',{exact:true}).fill('Tail-29');
 await expect(text.getByRole('option')).toHaveCount(1);
 await text.getByRole('option',{name:'Vendor/Tail-29',exact:true}).click();
 await expect(text.getByLabel('模型名称',{exact:true})).toHaveValue('Vendor/Tail-29');
 await text.getByRole('button',{name:'保存',exact:true}).click();
 await expect(text.getByText('已保存到当前账号',{exact:false})).toBeVisible();
 expect(apiModel.configs[0].model).toBe('Vendor/Tail-29');
});
test('saving without a prior probe triggers one read-only probe that does not resend the key',async({page,apiModel})=>{
 await page.goto('/settings/connections');const text=card(page,'text');
 await text.getByLabel('地址',{exact:true}).fill('https://fake.example/api');await text.getByLabel('密钥',{exact:true}).fill('FAKE_UI_KEY');
 await text.getByLabel('模型名称',{exact:true}).fill('Vendor/Manual');
 await text.getByRole('button',{name:'保存',exact:true}).click();
 await expect(text.getByText('已保存到当前账号',{exact:false})).toBeVisible();
 await expect(text.getByText('连接成功 · 已获取 1 个模型',{exact:false})).toBeVisible();
 expect(apiModel.probes).toHaveLength(1);expect(apiModel.probes[0].input).not.toHaveProperty('apiKey');
});
test('re-entering settings probes the saved key once with a checking indicator and no generation',async({page,apiModel})=>{
 apiModel.configs=[{channel:'text',apiBase:'https://fake.example/api',model:'Vendor/Saved',revision:1,hasKey:true}];
 let release!:()=>void;apiModel.probeGate=new Promise<void>(resolve=>{release=resolve;});
 try{
  await page.goto('/settings/connections');const text=card(page,'text');
  await expect.poll(()=>apiModel.probes.length).toBe(1);
  await expect(text.getByRole('status')).toContainText('正在检测');
  release();
  await expect(text.getByRole('status')).toContainText('连接成功 · 已获取 1 个模型');
  expect(apiModel.probes[0].input).not.toHaveProperty('apiKey');
  await page.getByRole('link',{name:'项目',exact:true}).click();await page.getByRole('link',{name:'设置',exact:true}).click();
  await expect.poll(()=>apiModel.probes.length).toBe(2);
 }finally{release();}
});
test('legacy welcome entry redirects to settings and keeps typed drafts across the redirect',async({page,apiModel})=>{
 await page.goto('/welcome');await expect(page).toHaveURL(/\/settings\/connections$/);const text=card(page,'text');await text.getByLabel('地址',{exact:true}).fill('https://fake.example');await text.getByLabel('密钥',{exact:true}).fill('FAKE_KEEP_REDIRECT');await text.getByLabel('模型名称',{exact:true}).fill('Vendor/Unsaved');await expect(text.getByLabel('密钥',{exact:true})).toHaveValue('FAKE_KEEP_REDIRECT');expect(apiModel.configWrites).toHaveLength(0);expect(apiModel.probes).toHaveLength(0);
});
test('expand all models with a saved selection exposes the complete catalog without clearing that selection',async({page,apiModel})=>{
 apiModel.configs=[{channel:'text',apiBase:'https://fake.example',model:'Vendor/A',revision:1,hasKey:true}];apiModel.models=['Vendor/A','Vendor/B','Vendor/C'];
 await page.goto('/settings/connections');const card=page.getByRole('region',{name:'文字 API',exact:true});
 await expect(card.getByRole('status')).toContainText('已获取 3 个模型');
 await expect(card.getByRole('combobox')).toHaveValue('Vendor/A');
 await card.getByRole('button',{name:'展开模型列表',exact:true}).click();
 expect(await card.getByRole('option').allTextContents()).toEqual(['Vendor/A','Vendor/B','Vendor/C']);
 await expect(card.getByRole('combobox')).toHaveValue('Vendor/A');
});
test('an upstream 503 is not presented as bad credentials',async({page})=>{
 const {RestrictedOutbound:_auditOutbound}=await import('../../server/src/security/outbound.js');
 const {probeModels:probeDirect}=await import('../../server/src/settings/probe.js');
 const outbound=new _auditOutbound({resolve:async()=>[{address:'93.184.216.34',family:4}],request:async()=>({status:503,body:Buffer.from('{}')})});
 await page.route('**/studio-api/me/model-configs/text/test',async route=>{
  const input=route.request().postDataJSON();const result=await probeDirect(outbound,'text',input.apiBase,input.apiKey,input.requestId);await route.fulfill({status:200,json:result});
 });
 await page.goto('/settings/connections');const card=page.getByRole('region',{name:'文字 API',exact:true});
 await card.getByLabel('地址',{exact:true}).fill('https://fake.example');await card.getByLabel('密钥',{exact:true}).fill('FAKE_AUDIT_KEY');
 await card.getByRole('button',{name:'测试连接',exact:true}).click();
 await expect(card.getByRole('status')).not.toContainText('正在检测');
 await expect(card.getByRole('status')).not.toContainText('权限或密钥错误');
});
