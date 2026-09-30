import {test,expect} from '../helpers/network-guard';
test('T11-C01/C02: local mode enters projects and eight owned navigation entries are available',async({page,networkCounter})=>{
 await page.goto('/welcome');await page.getByRole('button',{name:'进入本地模式',exact:true}).click();await expect(page).toHaveURL(/\/projects$/);
 await expect(page.getByRole('navigation',{name:'主导航'}).getByRole('link')).toHaveCount(8);
 for(const name of ['项目','素材','提示词生成','提示词库','任务','活动','设置','帮助'])await expect(page.getByRole('navigation',{name:'主导航'}).getByRole('link',{name,exact:true})).toBeVisible();
 expect(networkCounter.requests.filter(r=>r.method==='POST')).toHaveLength(0);await page.screenshot({path:'docs/review/screenshots/T11-shell-dark.png'});
});
test('T11 welcome: unsafe address is rejected, Key visibility resets on blur and no credentials persist',async({page,networkCounter})=>{
 await page.goto('/welcome');await page.getByLabel('Core 服务地址').fill('https://user:pass@core.invalid/?key=bad');await page.getByLabel('普通用户 Key').focus();await expect(page.getByRole('alert')).toContainText('不含用户名、密码');
 await page.getByLabel('普通用户 Key').fill('fake-welcome-only-key');await page.getByRole('button',{name:'显示 Key',exact:true}).click();await expect(page.getByLabel('普通用户 Key')).toHaveAttribute('type','text');
 await page.getByLabel('Core 服务地址').focus();await expect(page.getByLabel('普通用户 Key')).toHaveAttribute('type','password');expect(await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}))).not.toContain('fake-welcome-only-key');
 await expect(page.getByRole('button',{name:'测试连接',exact:true})).toBeDisabled();expect(networkCounter.requests.filter(r=>r.method==='POST')).toHaveLength(0);
});
test('T11 global search uses local data and returns actual project titles without network',async({page,networkCounter})=>{
 await page.goto('/projects');await page.evaluate(async()=>{
  const path='/src/infrastructure/storage/database.ts';const {openStudioDb,transact}=await import(path) as typeof import('../../src/infrastructure/storage/database');const db=await openStudioDb();
  try{await transact(db,['projects'],'readwrite',tx=>{tx.objectStore('projects').put({id:'search-project',schemaVersion:1,title:'原创测试搜索',description:'',revision:1,createdAt:1000,updatedAt:1000,archived:false,trashedAt:null,tags:[]});});}finally{db.close();}
 });
 await page.getByRole('searchbox',{name:'全局搜索'}).fill('测试搜索');await expect(page.getByRole('link',{name:'项目 · 原创测试搜索'})).toBeVisible();
 expect(networkCounter.requests.filter(r=>r.method==='POST')).toHaveLength(0);await page.getByRole('button',{name:'清除搜索'}).click();await expect(page.getByRole('searchbox',{name:'全局搜索'})).toHaveValue('');
});
test('T11-C03: unknown routes show owned 404 and a working return',async({page})=>{
 await page.goto('/unknown-page');await expect(page.getByRole('heading',{name:'找不到这个页面'})).toBeVisible();await page.getByRole('link',{name:'返回项目'}).click();await expect(page).toHaveURL(/\/projects$/);
});
test('T11-C04: nested dialogs trap focus, Esc closes the top layer and restores its trigger',async({page})=>{
 await page.goto('/projects');await page.getByRole('button',{name:'命令面板',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'命令面板',exact:true})).toBeVisible();const trigger=page.getByRole('button',{name:'快捷键说明',exact:true});await trigger.click();
 const inner=page.getByRole('dialog',{name:'快捷键说明',exact:true});await expect(inner).toBeVisible();for(let i=0;i<7;i++){await page.keyboard.press('Tab');expect(await inner.evaluate(element=>element.contains(document.activeElement))).toBe(true);}
 await page.keyboard.press('Escape');await expect(inner).not.toBeVisible();await expect(trigger).toBeFocused();
 await page.keyboard.press('Escape');await expect(page.getByRole('dialog',{name:'命令面板',exact:true})).not.toBeVisible();await expect(page.getByRole('button',{name:'命令面板',exact:true})).toBeFocused();
});
test('T11-C05: composing and editable targets do not trigger global keyboard commands',async({page})=>{
 await page.goto('/projects');const search=page.getByRole('searchbox',{name:'全局搜索'});await search.focus();await search.dispatchEvent('keydown',{key:'k',code:'KeyK',ctrlKey:true,isComposing:true,bubbles:true});
 await page.keyboard.press('Control+k');await expect(page.getByRole('dialog',{name:'命令面板',exact:true})).not.toBeVisible();
 await search.evaluate(element=>(element as HTMLInputElement).blur());await page.keyboard.press('Control+k');await expect(page.getByRole('dialog',{name:'命令面板',exact:true})).toBeVisible();
});
test('T11-C06: entry/navigation never opens external links automatically',async({page,context,networkCounter})=>{
 const opened:string[]=[];context.on('page',tab=>opened.push(tab.url()));
 await page.goto('/welcome');await page.getByRole('button',{name:'进入本地模式',exact:true}).click();await page.getByRole('link',{name:'帮助',exact:true}).click();
 expect(opened).toHaveLength(0);expect(networkCounter.requests.filter(r=>!r.url.startsWith('http://127.0.0.1:4179')&&!r.url.startsWith('ws://127.0.0.1:4179'))).toHaveLength(0);
});
test('T11: accepted font size, dark/light themes and narrow layout remain readable',async({page})=>{
 await page.goto('/projects');expect(await page.locator('body').evaluate(element=>getComputedStyle(element).fontSize)).toBe('16px');
 await page.getByRole('button',{name:'切换到浅色主题'}).click();await expect(page.locator('html')).toHaveAttribute('data-theme','light');
 await page.screenshot({path:'docs/review/screenshots/T11-shell-light.png'});await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme','light');
 await page.setViewportSize({width:720,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'docs/review/screenshots/T11-shell-narrow.png'});
});
