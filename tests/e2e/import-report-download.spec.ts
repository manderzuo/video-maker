import {test,expect} from '../helpers/network-guard';
import {readFile} from 'node:fs/promises';
import type {Page} from '@playwright/test';
import {seedStudio} from '../helpers/seed-studio';

const stored=(page:Page)=>page.evaluate(async()=>{
 const path='/src/infrastructure/storage/database.ts',m=await import(path);
 return m.withDatabase(undefined,(db:import('../../src/infrastructure/storage/database').StudioDb)=>m.transact(db,['projects','graphs','runs','receipts'],'readonly',async(tx:IDBTransaction)=>Object.fromEntries(await Promise.all(['projects','graphs','runs','receipts'].map(async table=>[table,await m.requestResult(tx.objectStore(table).getAll())])))));
});

test('QA050 committed import remains visibly successful after report download refusal and explicit report retry never imports again',async({page,networkCounter})=>{
 await seedStudio(page,'canvas-project');
 const bytes=await page.evaluate(async()=>{const path='/src/infrastructure/packages/export-project.ts';return (await (await import(path)).exportProject('p1',{mode:'structure'})).blob.text();});
 await page.goto('/projects/packages');
 const before=await stored(page);
 await page.getByLabel('选择项目包',{exact:true}).setInputFiles({name:'report-download.json',mimeType:'application/json',buffer:Buffer.from(bytes)});
 const dialog=page.getByRole('dialog',{name:'检查项目包',exact:true});
 await expect(dialog).toContainText('仅结构包');
 await page.evaluate(()=>{
  const original=HTMLAnchorElement.prototype.click;let armed=true;
  HTMLAnchorElement.prototype.click=function(){if(armed&&this.download==='project-import-report.json'){armed=false;throw new DOMException('native-report-download-denied','NotAllowedError');}return original.call(this);};
 });
 await dialog.getByRole('button',{name:'导入新项目',exact:true}).click();
 await expect(dialog).toHaveCount(0);
 await expect(page.getByRole('status').filter({hasText:'已导入新项目'})).toBeVisible();
 await expect(page.getByRole('alert')).toHaveText('项目已导入，报告下载未完成；请点击“下载导入报告”重试，勿重复导入。');
 const committed=await stored(page);
 expect(committed.projects).toHaveLength(before.projects.length+1);
 expect(committed.projects.find((p:{id:string})=>p.id==='p1')).toEqual(before.projects.find((p:{id:string})=>p.id==='p1'));
 expect(committed.graphs.find((g:{projectId:string})=>g.projectId==='p1')).toEqual(before.graphs.find((g:{projectId:string})=>g.projectId==='p1'));
 expect(committed.runs).toEqual(before.runs);
 await page.getByRole('button',{name:'查看导入报告',exact:true}).click();
 const reportText=await page.getByRole('region',{name:'导入报告',exact:true}).locator('pre').textContent();
 const report=JSON.parse(reportText!);
 expect(committed.projects.some((p:{id:string})=>p.id===report.projectId)).toBe(true);
 const pending=page.waitForEvent('download');
 await page.getByRole('button',{name:'下载导入报告',exact:true}).click();
 const downloaded=await pending;
 expect(downloaded.suggestedFilename()).toBe('project-import-report.json');
 expect(JSON.parse((await readFile((await downloaded.path())!)).toString())).toEqual(report);
 await expect(page.getByRole('alert')).toHaveCount(0);
 expect(await stored(page)).toEqual(committed);
 expect(networkCounter.paidRequests).toHaveLength(0);
 expect(networkCounter.requests.filter(request=>request.method==='POST')).toHaveLength(0);
});
