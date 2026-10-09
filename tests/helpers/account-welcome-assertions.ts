import {expect,type Page} from '@playwright/test';
export async function assertAuthenticatedSettingsEntry(page:Page){
 await expect(page).toHaveURL(/\/settings\/connections$/);
 for(const name of['视频 API','文字 API']){const card=page.getByRole('region',{name,exact:true});await expect(card).toBeVisible();await expect(card.locator('input')).toHaveCount(3);await expect(card.getByRole('button')).toHaveCount(3);await expect(card.locator('input[type=password]')).toHaveValue('');}
 await expect(page.getByRole('link',{name:'使用引导',exact:true})).toHaveCount(0);
}
