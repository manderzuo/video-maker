import {test,expect} from '../helpers/network-guard';

test('appearance reset preserves project view and capability-display choices outside its stated scope',async({page,networkCounter})=>{
 await page.goto('/projects');
 await page.getByRole('combobox',{name:'排序',exact:true}).selectOption('title');
 await page.getByRole('button',{name:'列表视图',exact:true}).click();
 await expect(page.getByRole('button',{name:'网格视图',exact:true})).toBeVisible();
 await page.goto('/settings/capabilities');
 await page.getByRole('checkbox',{name:'显示未开放能力说明',exact:true}).uncheck();
 await page.goto('/settings/appearance');
 await page.getByLabel('主题',{exact:true}).selectOption('light');
 await page.getByLabel('界面密度',{exact:true}).selectOption('compact');
 await page.getByRole('button',{name:'重置操作偏好',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'重置操作偏好',exact:true})).toContainText('仅重置主题、密度、动画与播放偏好');
 await page.getByRole('dialog',{name:'重置操作偏好',exact:true}).getByRole('button',{name:'确认重置偏好',exact:true}).click();
 await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 await page.goto('/projects');
 await expect(page.getByRole('combobox',{name:'排序',exact:true})).toHaveValue('title');
 await expect(page.getByRole('button',{name:'网格视图',exact:true})).toBeVisible();
 await page.goto('/settings/capabilities');
 await expect(page.getByRole('checkbox',{name:'显示未开放能力说明',exact:true})).not.toBeChecked();
 expect(networkCounter.paidRequests).toHaveLength(0);
});
