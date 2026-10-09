import {test,expect} from '../helpers/account-api-ui-fixture';
import {assertAuthenticatedSettingsEntry} from '../helpers/account-welcome-assertions';
test('Welcome redirects to shared settings while preserving legacy data, then opens the owned projects',async({page,apiModel})=>{
 await page.addInitScript(()=>{localStorage.setItem('aiwork-studio:preferences','FAKE_OLD_OWNER_PREFS');localStorage.setItem('aiwork-studio:onboarding','1');const original=indexedDB.open.bind(indexedDB);(window as Window&{legacyOpenNames?:string[]}).legacyOpenNames=[];indexedDB.open=((name:string,version?:number)=>{(window as Window&{legacyOpenNames?:string[]}).legacyOpenNames!.push(name);return original(name,version);}) as typeof indexedDB.open;});
 await page.goto('/welcome');await assertAuthenticatedSettingsEntry(page);
 expect(await page.evaluate(()=>(window as Window&{legacyOpenNames?:string[]}).legacyOpenNames)).toEqual([]);expect(await page.evaluate(()=>localStorage.getItem('aiwork-studio:preferences'))).toBe('FAKE_OLD_OWNER_PREFS');expect(apiModel.configWrites).toEqual([]);expect(apiModel.probes).toEqual([]);
 await page.goto('/');await expect(page).toHaveURL(/\/projects$/);await expect(page.getByText('还没有项目',{exact:true})).toBeVisible();expect(await page.evaluate(()=>(window as Window&{legacyOpenNames?:string[]}).legacyOpenNames)).toEqual([]);expect(apiModel.onboardingWrites).toEqual([]);expect(apiModel.configWrites).toEqual([]);expect(apiModel.probes).toEqual([]);
});
