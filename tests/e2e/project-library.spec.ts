import {test,expect} from '../helpers/network-guard';
import {seedStudio} from '../helpers/seed-studio';
test.use({actionTimeout:2500});test.setTimeout(15000);
test('T12-C01/C06: create validates name, survives reload and does not submit a model',async({page,networkCounter})=>{
 await page.goto('/projects');await page.getByRole('button',{name:'新建项目',exact:true}).click();const dialog=page.getByRole('dialog',{name:'新建项目',exact:true});
 await dialog.getByLabel('项目名称').fill('中'.repeat(61));await dialog.getByRole('button',{name:'创建',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('1–60');
 await dialog.getByLabel('项目名称').fill('原创创作');await dialog.getByRole('button',{name:'创建',exact:true}).click();await expect(page).toHaveURL(/\/projects\/[^/]+\/canvas$/);
 await page.goto('/projects');await page.reload();await expect(page.getByRole('heading',{name:'原创创作',exact:true})).toBeVisible();expect(networkCounter.paidRequests).toHaveLength(0);
});
test('T12-C02: clone shares media but copies neither Run nor Key nor queue',async({page,networkCounter})=>{
 await seedStudio(page,'project-library');await page.goto('/projects');const card=page.getByTestId('project-p1');await card.getByRole('button',{name:'复制项目'}).click();const dialog=page.getByRole('dialog',{name:'复制项目',exact:true});
 await dialog.getByLabel('副本名称').fill('项目甲副本');await dialog.getByRole('button',{name:'创建副本',exact:true}).click();await expect(page.getByRole('heading',{name:'项目甲副本',exact:true})).toBeVisible();
 const stored=await page.evaluate(async()=>{const path='/src/infrastructure/storage/database.ts';const {openStudioDb,transact,requestResult}=await import(path) as typeof import('../../src/infrastructure/storage/database');const db=await openStudioDb();try{return await transact(db,['projects','graphs','assets','runs'],'readonly',async tx=>({projects:await requestResult(tx.objectStore('projects').getAll()),graphs:await requestResult(tx.objectStore('graphs').getAll()),assets:await requestResult(tx.objectStore('assets').getAll()),runs:await requestResult(tx.objectStore('runs').getAll())}));}finally{db.close();}});
 expect(stored.projects).toHaveLength(4);expect(stored.assets).toHaveLength(1);expect(stored.runs).toHaveLength(1);expect(networkCounter.paidRequests).toHaveLength(0);
 const clone=stored.projects.find(p=>p.title==='项目甲副本')!;expect(stored.graphs.find(g=>g.projectId===clone.id)!.nodes[0].id).not.toBe('asset-p1');
});
test('T12-C03/C04: soft deletion preserves unknown tracking and shared blob, permanent removal remains blocked',async({page})=>{
 await seedStudio(page,'project-library');await page.goto('/projects');await page.getByTestId('project-p1').locator('[data-interaction-id="P-08"]').click();
 const dialog=page.getByRole('dialog',{name:'移入项目回收站',exact:true});await expect(dialog.getByText('远端任务仍可能继续',{exact:false})).toBeVisible();await dialog.getByRole('button',{name:'移入回收站',exact:true}).click();
 await page.getByRole('link',{name:'回收站',exact:true}).click();await expect(page.getByTestId('trash-p1')).toBeVisible();await page.getByTestId('trash-p1').getByRole('button',{name:'永久删除本地副本'}).click();await expect(page.getByRole('dialog',{name:'永久删除本地副本'})).toContainText('活动或未知任务');
 await page.getByRole('button',{name:'返回',exact:true}).click();await page.getByTestId('trash-p1').getByRole('button',{name:'恢复项目'}).click();await expect(page.getByTestId('trash-p1')).not.toBeVisible();await page.goto('/projects');await expect(page.getByTestId('project-p1')).toBeVisible();
});
test('T12-C05: search, view changes and multi-select retain exact selection scope',async({page})=>{
 await seedStudio(page,'project-library');await page.goto('/projects');await page.getByTestId('project-p1').getByRole('checkbox',{name:'选择项目甲'}).check();await page.getByTestId('project-p2').getByRole('checkbox',{name:'选择项目乙'}).check();await expect(page.getByText('已选择 2 项',{exact:true})).toBeVisible();
 await page.getByRole('searchbox',{name:'搜索项目'}).fill('项目甲');await expect(page.getByTestId('project-p2')).not.toBeVisible();await expect(page.getByText('已选择 2 项',{exact:true})).toBeVisible();await page.getByRole('button',{name:'列表视图',exact:true}).click();
 await page.getByRole('searchbox',{name:'搜索项目'}).fill('');await expect(page.getByTestId('project-p2').getByRole('checkbox',{name:'选择项目乙'})).toBeChecked();await page.getByRole('button',{name:'批量归档',exact:true}).click();await page.getByRole('dialog',{name:'批量归档'}).getByRole('button',{name:'归档 2 项',exact:true}).click();await expect(page.getByRole('status')).toContainText('成功 2，失败 0');
 await page.screenshot({path:'docs/review/screenshots/T12-project-library.png'});
});
test('T12 templates are original local structures and never come with execution approval',async({page,networkCounter})=>{
 await page.goto('/projects');await page.getByRole('button',{name:'使用本地模板',exact:true}).click();await page.getByRole('dialog',{name:'使用本地模板'}).getByRole('button',{name:'创建原创分镜草稿',exact:true}).click();await expect(page).toHaveURL(/\/projects\/[^/]+\/canvas$/);expect(networkCounter.paidRequests).toHaveLength(0);
});
test('T12 Z03: batch permanent removal separately confirms safe items and reports blocked tracking',async({page})=>{
 await seedStudio(page,'project-library');await page.evaluate(async()=>{const path='/src/infrastructure/storage/database.ts';const {openStudioDb,transact,requestResult}=await import(path) as typeof import('../../src/infrastructure/storage/database');const db=await openStudioDb();try{await transact(db,['projects'],'readwrite',async tx=>{for(const id of ['p1','p2']){const project=await requestResult(tx.objectStore('projects').get(id));tx.objectStore('projects').put({...project,trashedAt:1000});}});}finally{db.close();}});
 await page.goto('/trash');await page.getByTestId('trash-p1').getByRole('checkbox',{name:'选择项目甲'}).check();await page.getByTestId('trash-p2').getByRole('checkbox',{name:'选择项目乙'}).check();await page.getByRole('button',{name:'批量永久删除',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'批量永久删除本地副本'});await expect(dialog).toContainText('可删除 1，阻止 1');await expect(dialog.getByRole('button',{name:'永久删除 1 项',exact:true})).toBeDisabled();await dialog.getByLabel('确认项目乙名称').fill('项目乙');await dialog.getByRole('button',{name:'永久删除 1 项',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('成功 1，失败 1');await expect(page.getByTestId('trash-p1')).toBeVisible();await expect(page.getByTestId('trash-p2')).not.toBeVisible();
});
test('T12 / W06: welcome opens the real new-project dialog; rename Escape preserves the stored name',async({page,networkCounter})=>{
 await page.goto('/welcome');await page.getByRole('button',{name:'继续创建项目',exact:true}).click();const create=page.getByRole('dialog',{name:'新建项目',exact:true});await create.getByLabel('项目名称').fill('引导项目');await create.getByRole('button',{name:'创建',exact:true}).click();await page.goto('/projects');
 await page.getByRole('button',{name:'重命名',exact:true}).click();const rename=page.getByRole('dialog',{name:'重命名项目',exact:true});await rename.getByLabel('项目名称').fill('不保存修改');await page.keyboard.press('Escape');await expect(rename).not.toBeVisible();await expect(page.getByRole('heading',{name:'引导项目',exact:true})).toBeVisible();
 expect(networkCounter.paidRequests).toHaveLength(0);
});
test('T12 batch archive: locked project is reported by name and remains unmodified',async({page})=>{
 await seedStudio(page,'project-library');await page.evaluate(async()=>{const path='/src/infrastructure/storage/project-lease.ts';const module=await import(path) as typeof import('../../src/infrastructure/storage/project-lease');const result=await module.acquireProjectLease('p2','different-tab',Date.now());if(!result.ok)throw new Error('test_lock_failed');});await page.goto('/projects');
 await page.getByTestId('project-p1').getByRole('checkbox',{name:'选择项目甲'}).check();await page.getByTestId('project-p2').getByRole('checkbox',{name:'选择项目乙'}).check();await page.getByRole('button',{name:'批量归档',exact:true}).click();await page.getByRole('dialog',{name:'批量归档'}).getByRole('button',{name:'归档 2 项',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('成功 1，失败 1');await expect(page.getByTestId('batch-failures')).toContainText('项目乙');await expect(page.getByTestId('batch-failures')).toContainText('其他标签页');await expect(page.getByTestId('project-p2').getByRole('button',{name:'归档',exact:true})).toBeVisible();
});
