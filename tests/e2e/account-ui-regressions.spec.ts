import {test,expect} from '../helpers/account-ui-fixture';
const theme='\u4e3b\u9898',sort='\u9879\u76ee\u6392\u5e8f',reload='\u91cd\u65b0\u52a0\u8f7d\u504f\u597d',save='\u4fdd\u5b58\u504f\u597d';
test('UI-only: explicit reload resets unsaved draft when server revision and preferences are unchanged',async({page,uiModel})=>{
 await page.goto('/settings/appearance');await expect(page.getByLabel(theme,{exact:true})).toHaveValue('dark');await page.getByLabel(theme,{exact:true}).selectOption('light');await page.getByLabel(sort,{exact:true}).selectOption('title');
 await page.getByRole('button',{name:reload,exact:true}).click();await expect.poll(()=>uiModel.documentReads).toBe(2);await expect(page.getByLabel(theme,{exact:true})).toHaveValue('dark');await expect(page.getByLabel(sort,{exact:true})).toHaveValue('updated');expect(uiModel.document.revision).toBe(0);expect(uiModel.writes).toEqual([]);
});
test('UI-only: same-context focus check retains unsaved draft without loading document again',async({page,uiModel})=>{
 await page.goto('/settings/appearance');await expect(page.getByLabel(theme,{exact:true})).toHaveValue('dark');await page.getByLabel(theme,{exact:true}).selectOption('light');await page.getByLabel(sort,{exact:true}).selectOption('title');const previousSessions=uiModel.sessionReads;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect.poll(()=>uiModel.sessionReads).toBeGreaterThan(previousSessions);expect(uiModel.documentReads).toBe(1);await expect(page.getByLabel(theme,{exact:true})).toHaveValue('light');await expect(page.getByLabel(sort,{exact:true})).toHaveValue('title');
});
test('UI-only: revision conflict retains draft until explicit reload clears draft and error',async({page,uiModel})=>{
 await page.goto('/settings/appearance');await expect(page.getByLabel(theme,{exact:true})).toHaveValue('dark');await page.getByLabel(theme,{exact:true}).selectOption('light');await page.getByLabel(sort,{exact:true}).selectOption('title');uiModel.conflictNextWrite=true;await page.getByRole('button',{name:save,exact:true}).click();await expect(page.getByRole('alert')).toBeVisible();await expect(page.getByLabel(theme,{exact:true})).toHaveValue('light');await page.getByRole('button',{name:reload,exact:true}).click();await expect(page.getByLabel(theme,{exact:true})).toHaveValue('dark');await expect(page.getByLabel(sort,{exact:true})).toHaveValue('updated');await expect(page.getByRole('alert')).toHaveCount(0);expect(uiModel.document.revision).toBe(1);
});
test('UI-only: failed reload retains unsaved draft and reports an error',async({page,uiModel})=>{
 await page.goto('/settings/appearance');await expect(page.getByLabel(theme,{exact:true})).toHaveValue('dark');await page.getByLabel(theme,{exact:true}).selectOption('light');await page.getByLabel(sort,{exact:true}).selectOption('title');uiModel.failNextDocumentRead=true;await page.getByRole('button',{name:reload,exact:true}).click();await expect(page.getByRole('alert')).toBeVisible();await expect(page.getByLabel(theme,{exact:true})).toHaveValue('light');await expect(page.getByLabel(sort,{exact:true})).toHaveValue('title');expect(uiModel.document.revision).toBe(0);expect(uiModel.writes).toEqual([]);
});

test('UI-only: latest navigation is saved after an earlier navigation response is released',async({page,uiModel})=>{
 uiModel.document.lastVisitedPage='/projects';let release!:()=>void;uiModel.writeGate=new Promise<void>(resolve=>{release=resolve;});try{
  await page.goto('/settings/connections');await expect.poll(()=>uiModel.writes.length).toBe(1);await page.getByRole('link',{name:'\u8d26\u53f7\u504f\u597d',exact:true}).click();await expect(page).toHaveURL(/\/settings\/appearance$/);release();await expect.poll(()=>uiModel.writes).toEqual([{expectedRevision:0,lastVisitedPage:'/settings/connections'},{expectedRevision:1,lastVisitedPage:'/settings/appearance'}]);await expect(page.getByRole('alert')).toHaveCount(0);expect(uiModel.document.lastVisitedPage).toBe('/settings/appearance');
 }finally{release();}
});
test('UI-only: navigation waits for manual preference save and preserves its accepted preferences',async({page,uiModel})=>{
 await page.goto('/settings/appearance');await expect(page.getByLabel(theme,{exact:true})).toHaveValue('dark');await page.getByLabel(theme,{exact:true}).selectOption('light');let release!:()=>void;uiModel.writeGate=new Promise<void>(resolve=>{release=resolve;});try{
  await page.getByRole('button',{name:save,exact:true}).click();await expect.poll(()=>uiModel.writes.length).toBe(1);await page.getByRole('link',{name:'API \u8bbe\u7f6e',exact:true}).click();await expect(page).toHaveURL(/\/settings\/connections$/);release();await expect.poll(()=>uiModel.writes.length).toBe(2);expect(uiModel.writes[1]).toEqual({expectedRevision:1,lastVisitedPage:'/settings/connections'});expect(uiModel.document.preferences.theme).toBe('light');await expect(page.getByRole('alert')).toHaveCount(0);
 }finally{release();}
});
