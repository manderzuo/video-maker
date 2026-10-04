import {test,expect} from '../helpers/network-guard';
import {f} from '../helpers/fixtures';

test('a sole saved text profile is shown after reload without restoring its Key or claiming generation success',async({page,networkCounter})=>{
 const profile=f.connection({id:'saved-text',name:'已保存的文字连接',originSnapshot:'https://text.example.invalid/v1',proxyBase:'/text-api/registered/saved-text',contractVersion:'openai-compatible-text-v1'});
 await page.goto('/settings/connections');
 await page.evaluate(async row=>{
  const path='/src/infrastructure/storage/database.ts',m=await import(path);
  await m.withDatabase(undefined,(db:import('../../src/infrastructure/storage/database').StudioDb)=>m.transact(db,['diagnostics'],'readwrite',(tx:IDBTransaction)=>{tx.objectStore('diagnostics').put(row);}));
 },{id:'text-profile:'+profile.id,profile,model:'fake-text-only'});
 await page.reload();
 await expect(page.getByLabel('已保存文字连接',{exact:true})).toHaveValue('text-profile:'+profile.id);
 await expect(page.getByLabel('文字 API 地址',{exact:true})).toHaveValue(profile.originSnapshot);
 await expect(page.getByLabel('独立文字模型',{exact:true})).toHaveValue('fake-text-only');
 await expect(page.getByLabel('文字 API 状态',{exact:true})).toContainText('已配置 · 本标签页未授权');
 await expect(page.getByLabel('文字 API Key',{exact:true})).toHaveValue('');
 await expect(page.getByRole('button',{name:'启用独立文字连接',exact:true})).toBeDisabled();
 expect(networkCounter.paidRequests).toHaveLength(0);
});

test('new independent text profile clears the old address and model while preserving the saved profile',async({page,networkCounter})=>{
 const profile=f.connection({id:'saved-text',name:'已有文字档案',originSnapshot:'https://text.example.invalid/v1',proxyBase:'/text-api/registered/saved-text',contractVersion:'openai-compatible-text-v1'});
 await page.goto('/settings/connections');
 await page.evaluate(async row=>{
  const path='/src/infrastructure/storage/database.ts',m=await import(path);
  await m.withDatabase(undefined,(db:import('../../src/infrastructure/storage/database').StudioDb)=>m.transact(db,['diagnostics'],'readwrite',(tx:IDBTransaction)=>{tx.objectStore('diagnostics').put(row);}));
 },{id:'text-profile:'+profile.id,profile,model:'fake-text-only'});
 await page.reload();
 const saved=page.getByLabel('已保存文字连接',{exact:true});
 await expect(saved).toHaveValue('text-profile:'+profile.id);
 await saved.selectOption('');
 await expect(saved).toHaveValue('');
 await expect(page.getByLabel('文字连接名称',{exact:true})).toHaveValue('独立文字模型');
 await expect(page.getByLabel('文字 API 地址',{exact:true})).toHaveValue('');
 await expect(page.getByLabel('独立文字模型',{exact:true})).toHaveValue('');
 await expect(page.getByLabel('文字 API 状态',{exact:true})).toContainText('配置缺失');
 await expect(saved).toContainText('已有文字档案');
 await page.getByLabel('文字 API 地址',{exact:true}).fill('https://new-text.example.invalid/v1');
 await expect(page.getByLabel('文字 API 状态',{exact:true})).toContainText('配置已变更 · 待只读核验');
 await expect(page.getByLabel('文字 API 状态',{exact:true})).not.toContainText('上次只读验证');
 await saved.selectOption('text-profile:'+profile.id);
 await expect(page.getByLabel('文字 API 地址',{exact:true})).toHaveValue(profile.originSnapshot);
 await expect(page.locator('.text-api-settings').getByRole('status')).not.toContainText('正在新增独立文字连接');
 expect(networkCounter.paidRequests).toHaveLength(0);
});
