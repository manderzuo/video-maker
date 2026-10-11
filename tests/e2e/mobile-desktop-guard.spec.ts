import {test,expect} from '../helpers/cloud-workspace-ui-fixture';
// Catches desktop layout changes caused by mobile CSS, routing or component defaults.
test('preserves desktop pages in both themes',async({page,workspace})=>{
 const routes=[['projects','/projects'],['writing','/prompt-generator'],['assets','/assets'],['tasks','/tasks'],['settings','/settings/connections']];
 for(const theme of ['dark','light']){
  await page.goto('/settings/appearance');await page.getByLabel('主题',{exact:true}).selectOption(theme);await page.getByRole('button',{name:'保存偏好',exact:true}).click();await expect(page.getByText('偏好已保存',{exact:false})).toBeVisible();
  for(const [name,url] of routes){
   await page.goto(url);await expect(page.locator('.account-shell')).toBeVisible();await expect(page.locator('.account-content h1').first()).toBeVisible();await expect(page.locator('.mobile-workspace')).toHaveCount(0);
   await expect(page).toHaveScreenshot(name+'-'+theme+'.png',{animations:'disabled',maxDiffPixelRatio:0.001});
  }
 }
 expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(0);
});

test('keeps desktop canvas mouse and keyboard operations',async({page,workspace})=>{
 const project=(await workspace.call('POST','/studio-api/projects',{...workspace.headers(workspace.account),payload:{title:'TEST DATA 桌面保护'}})).json();
 await page.goto('/projects/'+project.id+'/canvas');await page.getByRole('button',{name:'添加文字节点',exact:true}).click();
 await page.locator('[data-interaction-id="cloud:canvas:node-text"]').first().fill('桌面正文');await expect(page.getByRole('status').first()).toContainText('已保存');
 await page.getByRole('button',{name:'添加节点',exact:true}).click();await page.locator('[data-interaction-id="cloud:canvas:dialog-model"]').fill('seedance');await page.getByRole('button',{name:'添加视频草稿',exact:true}).click();
 await page.getByRole('button',{name:'输出文本',exact:true}).press('Enter');await page.getByRole('button',{name:'接收文本',exact:true}).click();await expect(page.locator('.canvas-wire')).toHaveCount(1);
 await expect(page.getByRole('status').first()).toContainText('已保存');await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(page.locator('.canvas-wire')).toHaveCount(0);await page.getByRole('button',{name:'重做',exact:true}).click();await expect(page.locator('.canvas-wire')).toHaveCount(1);
 expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(0);
});
