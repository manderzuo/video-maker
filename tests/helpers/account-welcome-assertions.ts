import {expect,type Page} from '@playwright/test';
export async function assertAuthenticatedWelcome(page:Page){
 await expect(page).toHaveURL(/\/welcome$/);await expect(page.locator('input')).toHaveCount(6);
 for(const name of['\u89c6\u9891 API','\u6587\u5b57 API']){const card=page.getByRole('region',{name,exact:true});await expect(card).toBeVisible();await expect(card.locator('input')).toHaveCount(3);await expect(card.getByRole('button')).toHaveCount(2);await expect(card.locator('input[type=password]')).toHaveValue('');}
 await expect(page.getByRole('button',{name:'\u8fdb\u5165\u5de5\u4f5c\u53f0',exact:true})).toBeVisible();
}
