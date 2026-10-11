import {test,expect} from '../helpers/cloud-workspace-ui-fixture';
import type {Request} from '@playwright/test';
test('visible import button opens native picker and permits choosing the same file again',async({page,workspace},testInfo)=>{
 const project=(await workspace.call('POST','/studio-api/projects',{...workspace.headers(workspace.account),payload:{title:'Visible picker TEST DATA'}})).json();await page.goto('/projects/'+project.id+'/canvas');
 const png=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=8;return canvas.toDataURL('image/png').split(',')[1];});
 for(let count=1;count<=2;count++){
  const choice=page.waitForEvent('filechooser');await page.locator('[data-interaction-id="cloud:canvas:import-assets"]').click();const picker=await choice;expect(picker.isMultiple()).toBe(true);await picker.setFiles({name:'UI_TEST_import.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});await expect(page.locator('.node-asset')).toHaveCount(count);await expect(page.getByRole('status').first()).toContainText('已保存');await expect(page.locator('[data-interaction-id="cloud:canvas:files"]')).toHaveValue('');
 }
 await page.screenshot({path:testInfo.outputPath('ui-repair-visible-import.png')});expect(workspace.providerCalls).toHaveLength(0);
});


test('zoom cancellation preserves invalid unsaved node text and backward selection at 50 and 100 percent',async({page,workspace})=>{
 const project=(await workspace.call('POST','/studio-api/projects',{...workspace.headers(workspace.account),payload:{title:'Unsaved text TEST DATA'}})).json();await page.goto('/projects/'+project.id+'/canvas');await page.locator('[data-interaction-id="cloud:canvas:add-text"]').click();const editor=page.locator('[data-interaction-id="cloud:canvas:node-text"]').first(),zoom=page.locator('[data-interaction-id="C-05"]');await editor.fill('saved TEST DATA');await expect(page.getByRole('status').first()).toContainText('已保存');const original=await editor.elementHandle(),draft='x'.repeat(65537);
 for(const start of ['50','100']){
  await zoom.fill(start);await zoom.press('Enter');await editor.fill(draft);await editor.evaluate((el:HTMLTextAreaElement)=>el.setSelectionRange(7,19,'backward'));await zoom.fill('80');let updates=0;const listener=(request:Request)=>{if(request.method()==='POST'&&request.url().endsWith('/commands')&&request.postData()?.includes('update_node'))updates++;};page.on('request',listener);await page.locator('[data-interaction-id="cloud:canvas:readable-edit"]').first().click();await expect(zoom).toHaveValue('100');await expect(editor).toBeFocused();await expect(editor).toHaveValue(draft);expect(await original!.evaluate(el=>el===document.activeElement)).toBe(true);expect(await editor.evaluate((el:HTMLTextAreaElement)=>[el.selectionStart,el.selectionEnd,el.selectionDirection])).toEqual([7,19,'backward']);await expect(page.getByRole('alert').first()).toBeVisible();expect(updates).toBe(0);page.off('request',listener);
 }
 expect(workspace.providerCalls).toHaveLength(0);
});
