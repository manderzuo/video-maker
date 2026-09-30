import {test,expect} from '../helpers/network-guard';
test('T09 actual browser: refresh and second tab have no credential; storage, URL and console remain clean',async({page,context})=>{
 const key='fake-browser-only-key-T09',binding='browser-binding';
 const consoleMessages:string[]=[];page.on('console',message=>consoleMessages.push(message.text()));
 await page.goto('/tests/fixtures/import.html');
 await page.evaluate(async({key,binding})=>{
  const path='/src/security/credential-session.ts';
  const session=await import(path) as typeof import('../../src/security/credential-session');session.setSessionCredential(binding,key);
  if(!session.hasSessionCredential(binding))throw new Error('expected_session_in_memory');
 },{key,binding});
 const persisted=await page.evaluate(async()=>{
  const path='/src/infrastructure/storage/database.ts';
  const {openStudioDb,transact,requestResult}=await import(path) as typeof import('../../src/infrastructure/storage/database');
  const db=await openStudioDb();
  try{return JSON.stringify({local:{...localStorage},session:{...sessionStorage},url:location.href,records:await transact(db,db.tables.slice(),'readonly',tx=>Promise.all(db.tables.map(store=>requestResult(tx.objectStore(store).getAll()))))});}finally{db.close();}
 });
 expect(persisted).not.toContain(key);expect(await page.content()).not.toContain(key);
 const other=await context.newPage();await other.goto('/tests/fixtures/import.html');
 const hasCredential=async(target:typeof page)=>target.evaluate(async binding=>{const path='/src/security/credential-session.ts';const session=await import(path) as typeof import('../../src/security/credential-session');return session.hasSessionCredential(binding);},binding);
 expect(await hasCredential(other)).toBe(false);await page.reload();expect(await hasCredential(page)).toBe(false);expect(consoleMessages.join('\n')).not.toContain(key);
});
