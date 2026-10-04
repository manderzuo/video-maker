import {test,expect} from '../helpers/network-guard';
import {seedStudio} from '../helpers/seed-studio';

test('QA47 independent canvas entry chooses and switches projects without generation',async({page,networkCounter})=>{
 await seedStudio(page,'project-library');await page.goto('/projects');
 const nav=page.getByRole('navigation',{name:'主导航'});
 await nav.getByRole('link',{name:'画布',exact:true}).click({timeout:4000});
 await expect(page).toHaveURL(/\/canvas$/);
 const picker=page.getByLabel('画布项目', {exact:true});
 await expect(picker).toBeVisible();await expect(page.getByRole('button',{name:'进入画布',exact:true})).toBeDisabled();
 await picker.selectOption('p1');await page.getByRole('button',{name:'进入画布',exact:true}).click();
 await expect(page).toHaveURL(/\/projects\/p1\/canvas$/);await expect(page.getByRole('heading',{name:'项目甲',exact:true})).toBeVisible();
 await expect(nav.getByRole('link',{name:'画布',exact:true})).toHaveAttribute('aria-current','page');
 await expect(nav.getByRole('link',{name:'项目',exact:true})).not.toHaveAttribute('aria-current','page');
 await page.getByRole('link',{name:'切换项目',exact:true}).click();await expect(page).toHaveURL(/\/canvas$/);
 await picker.selectOption('p2');await page.getByRole('button',{name:'进入画布',exact:true}).click();
 await expect(page.getByRole('heading',{name:'项目乙',exact:true})).toBeVisible();
 expect(networkCounter.paidRequests).toHaveLength(0);
});

test('QA47 direct canvas entry survives reload and filters deleted projects',async({page,networkCounter})=>{
 await seedStudio(page,'project-library');
 await page.evaluate(async()=>{
  const path='/src/infrastructure/storage/database.ts';const {openStudioDb,transact,requestResult}=await import(path) as typeof import('../../src/infrastructure/storage/database');const db=await openStudioDb();
  try{await transact(db,['projects'],'readwrite',async tx=>{const project=await requestResult(tx.objectStore('projects').get('p2'));tx.objectStore('projects').put({...project,trashedAt:Date.now()});});}finally{db.close();}
 });
 await page.goto('/canvas');await page.reload();
 await expect(page.getByRole('heading',{name:'选择项目进入画布',exact:true})).toBeVisible();
 await expect(page.getByLabel('画布项目',{exact:true}).locator('option')).toHaveText(['请选择项目','项目甲','归档项目 · 已归档']);
 await page.getByLabel('画布项目',{exact:true}).selectOption('p3');await page.getByRole('button',{name:'进入画布',exact:true}).click();
 await expect(page.getByRole('heading',{name:'归档项目',exact:true})).toBeVisible();
 expect(networkCounter.paidRequests).toHaveLength(0);
});

test('QA47 empty canvas entry opens existing creation flow and remembers the standalone entry',async({page,networkCounter})=>{
 await page.goto('/welcome');await page.getByRole('button',{name:'进入本地模式',exact:true}).click();
 await page.getByRole('navigation',{name:'主导航'}).getByRole('link',{name:'画布',exact:true}).click();
 await expect(page.getByText('还没有项目，创建后即可开始画布创作。',{exact:true})).toBeVisible();
 await page.goto('/');await expect(page).toHaveURL(/\/canvas$/);
 await page.getByRole('link',{name:'新建项目',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'新建项目',exact:true});await dialog.getByLabel('项目名称').fill('从画布开始');await dialog.getByRole('button',{name:'创建',exact:true}).click();
 await expect(page.getByRole('heading',{name:'从画布开始',exact:true})).toBeVisible();
 expect(networkCounter.paidRequests).toHaveLength(0);
});

test('QA47 project list read failure can retry without erasing saved projects',async({page,networkCounter})=>{
 await seedStudio(page,'project-library');
 await page.evaluate(()=>{
  const getAll=IDBObjectStore.prototype.getAll;let once=true;
  IDBObjectStore.prototype.getAll=function(...args:Parameters<typeof getAll>){if(once&&this.name==='projects'){once=false;throw new DOMException('canvas-entry-read-failure','UnknownError');}return getAll.apply(this,args);};
 });
 await page.getByRole('navigation',{name:'主导航'}).getByRole('link',{name:'画布',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('项目列表读取失败');await expect(page.getByRole('button',{name:'进入画布',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'刷新项目列表',exact:true}).click();
 await expect(page.getByLabel('画布项目',{exact:true}).locator('option')).toHaveCount(4);
 await page.getByLabel('画布项目',{exact:true}).selectOption('p1');await page.getByRole('button',{name:'进入画布',exact:true}).click();await expect(page.getByRole('heading',{name:'项目甲',exact:true})).toBeVisible();
 expect(networkCounter.paidRequests).toHaveLength(0);
});

test('QA47 switching projects preserves the unsaved-change guard and cancel retains the draft',async({page,networkCounter})=>{
 await seedStudio(page,'canvas-project');await page.goto('/projects/p1/canvas');
 const text=page.getByRole('textbox',{name:'节点文本',exact:true});await expect(text).toBeEditable();
 await page.evaluate(()=>{
  const put=IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put=function(...args:Parameters<typeof put>){if(this.name==='graphs')throw new DOMException('canvas-switch-quota','QuotaExceededError');return put.apply(this,args);};
 });
 await text.fill('切换前保留的未保存内容');await page.getByRole('button',{name:'立即保存',exact:true}).click();
 await expect(page.locator('.canvas-heading [role="status"]')).toContainText('尚未保存');
 await page.getByRole('link',{name:'切换项目',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'离开前保存',exact:true});await expect(dialog).toBeVisible();await expect(page).toHaveURL(/\/projects\/p1\/canvas$/);
 await dialog.getByRole('button',{name:'继续编辑',exact:true}).click();await expect(dialog).not.toBeVisible();await expect(text).toHaveValue('切换前保留的未保存内容');
 expect(networkCounter.paidRequests).toHaveLength(0);
});
