import {randomUUID} from 'node:crypto';
import {test,expect} from '../helpers/cloud-workspace-ui-fixture';
// F038：中等桌面宽度保留输入+结果两主区，检查栏下置；更窄才单列退化。
// 按实际 boundingBox/可见性与两主题截图验证，不只断言 class。
test('keeps input and result side by side at desktop widths',async({page,workspace},testInfo)=>{
 const headers=workspace.headers(workspace.account);
 const draft=(await workspace.call('POST','/studio-api/prompt-drafts',{...headers,payload:{type:'video',userRequest:'布局验证正文',sceneId:'text',requestedSpec:{},audioPlan:'',lockedConstraints:[],references:[],ruleVersion:'studio-video-rules-v1',idempotencyKey:randomUUID()}})).json() as {id:string};
 expect((await workspace.call('POST','/studio-api/prompt-drafts/'+draft.id+'/compile',{...headers,payload:{expectedRevision:0}})).statusCode).toBe(200);
 for(const theme of ['dark','light']){
  await page.goto('/settings/appearance');
  await page.getByLabel('主题',{exact:true}).selectOption(theme);
  await page.getByRole('button',{name:'保存偏好',exact:true}).click();
  await expect(page.getByText('偏好已保存',{exact:false})).toBeVisible();
  for(const width of [1024,1100,1280,1440]){
   await page.setViewportSize({width,height:900});
   await page.goto('/prompt-generator?draft='+draft.id);
   await expect(page.locator('html[data-theme="'+theme+'"]')).toBeAttached();
   const colorScheme=await page.evaluate(()=>getComputedStyle(document.documentElement).colorScheme);
   expect(colorScheme).toContain(theme);
   const background=await page.evaluate(()=>getComputedStyle(document.body).backgroundColor);
   if(theme==='dark')expect(background).not.toBe('rgb(255, 255, 255)');
   else expect(background).not.toBe('rgb(0, 0, 0)');
   const input=page.locator('.pane-input'),result=page.locator('.pane-result'),text=page.locator('[data-interaction-id="cloud:draft:result-text"]');
   await expect(text).toBeVisible();
   const inputBox=await input.boundingBox(),resultBox=await result.boundingBox(),textBox=await text.boundingBox();
   if(!inputBox||!resultBox||!textBox)throw new Error('Missing writing panes');
   expect(Math.abs(inputBox.y-resultBox.y)).toBeLessThan(2);
   expect(textBox.y).toBeLessThan(900);
   expect(textBox.y+textBox.height).toBeGreaterThan(textBox.y);
   await expect(page.getByRole('button',{name:'保存为新的人工结果',exact:true})).toBeVisible();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   await page.screenshot({path:testInfo.outputPath('writing-'+theme+'-'+width+'.png')});
  }
 }
 expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(0);
});
