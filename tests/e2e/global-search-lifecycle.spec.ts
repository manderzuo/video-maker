import {test,expect} from '../helpers/network-guard';
import {seedStudio} from '../helpers/seed-studio';

test('QA049 global node search hides a recoverably trashed project and restores its real result after restore',async({page,networkCounter})=>{
 await seedStudio(page,'canvas-project');await page.goto('/projects');
 const search=page.getByRole('searchbox',{name:'全局搜索',exact:true});
 await search.fill('镜头一');await expect(page.getByRole('link',{name:'节点 · 镜头一',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'清除搜索',exact:true}).click();
 await page.getByTestId('project-p1').getByRole('button',{name:'移入回收站',exact:true}).click();
 await page.getByRole('dialog',{name:'移入项目回收站',exact:true}).getByRole('button',{name:'移入回收站',exact:true}).click();
 await expect(page.getByTestId('project-p1')).toHaveCount(0);
 await search.fill('镜头一');await expect(page.locator('.search-results')).toContainText('没有匹配内容');
 await expect(page.getByRole('link',{name:'节点 · 镜头一',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'清除搜索',exact:true}).click();
 await page.getByRole('link',{name:'回收站',exact:true}).click();
 await page.getByRole('button',{name:'恢复项目',exact:true}).click();
 await search.fill('镜头一');const result=page.getByRole('link',{name:'节点 · 镜头一',exact:true});await expect(result).toBeVisible();
 await result.click();await expect(page.getByLabel('节点文本',{exact:true})).toHaveValue('原创镜头');
 expect(networkCounter.paidRequests).toHaveLength(0);
});
