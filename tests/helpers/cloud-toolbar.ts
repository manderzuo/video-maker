import type {Page} from '@playwright/test';
export async function openCloudToolbarMenu(page:Page,label:'更多'|'视图选项'){
 const trigger=page.locator('.toolbar-disclosure > summary').filter({hasText:label});
 if(!await trigger.locator('..').getAttribute('open').then(value=>value!==null))await trigger.click();
}
