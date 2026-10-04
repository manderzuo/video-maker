import {test,expect} from '../helpers/network-guard';
import {f} from '../helpers/fixtures';
import {testDownloadDirectory} from '../helpers/download-directory';
import {mkdir,writeFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {zipSync,strToU8} from 'fflate';

test('QA32 canceling the native project file inspection returns focus to the file chooser and creates no project',async({page,networkCounter})=>{
 await page.goto('/projects/packages');
 const filePath=join(testDownloadDirectory('package-focus'),'qa32-focus.zip');
 await mkdir(dirname(filePath),{recursive:true});
 await writeFile(filePath,zipSync({
  'manifest.json':strToU8(JSON.stringify({format:'aiwork-studio-project',schemaVersion:1,mode:'structure',createdAt:1000,assets:[]})),
  'project.json':strToU8(JSON.stringify(f.project())),
  'graph.json':strToU8(JSON.stringify(f.graph())),
  'runs.json':strToU8('[]'),'drafts.json':strToU8('[]')
 }));
 const input=page.getByLabel('选择项目包',{exact:true});
 const choosing=page.waitForEvent('filechooser');
 await input.click();
 await (await choosing).setFiles(filePath);
 const dialog=page.getByRole('dialog',{name:'检查项目包',exact:true});
 await expect(dialog).toBeVisible();
 await dialog.getByRole('button',{name:'取消',exact:true}).click();
 await expect(dialog).not.toBeVisible();
 await expect(input).toBeFocused();
 const projectCount=await page.evaluate(async()=>{
  const path='/src/infrastructure/storage/database.ts',m=await import(path),db=await m.openStudioDb();
  try{return await m.transact(db,['projects'],'readonly',(tx:IDBTransaction)=>m.requestResult(tx.objectStore('projects').count()));}finally{db.close();}
 });
 expect(projectCount).toBe(0);
 expect(networkCounter.requests.filter(request=>request.method==='POST')).toHaveLength(0);
});
