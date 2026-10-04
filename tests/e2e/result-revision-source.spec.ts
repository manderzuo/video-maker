import {test,expect} from '../helpers/network-guard';
const stored=(page:import('@playwright/test').Page)=>page.evaluate(async()=>{const path='/tests/fixtures/result-review.ts';return(await import(path)).reviewStoredState();});
test.beforeEach(async({page})=>{await page.goto('/projects');await page.evaluate(async()=>{const path='/tests/fixtures/result-review.ts';await(await import(path)).seedResultReview();});await page.goto('/projects/p1/results?runId=r1');});
test('QA48 continuation connects original Video A and extracts an image without a disconnected frame node',async({page,networkCounter})=>{
 const before=await stored(page);await page.getByRole('button',{name:'尾帧续写',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'尾帧续写',exact:true});await dialog.getByLabel('下一段内容',{exact:true}).fill('人物继续推开大门');await dialog.getByRole('button',{name:'创建续写草稿',exact:true}).click();await expect(page).toHaveURL(/\/canvas\?node=/);
 const after=await stored(page),video=after.graph.nodes.find((n:{title:string})=>n.title==='尾帧续写视频'),edge=after.graph.edges.find((e:{targetId:string;port:string})=>e.targetId===video.id&&e.port==='image'),source=after.graph.nodes.find((n:{id:string})=>n.id===edge.sourceId);
 expect(source.data.assetId).toBe('result-asset-1');expect(source.data.tailFrame).toMatchObject({sourceRunId:'r1',sourceAssetId:'result-asset-1'});expect(after.assets.find((a:{id:string})=>a.id===source.data.tailFrame.assetId).mediaType).toBe('image');
 expect(after.graph.nodes.filter((n:{title:string})=>n.title==='尾帧参考')).toHaveLength(0);await expect(page.getByRole('button',{name:'输出尾帧',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:/连线 .* → 尾帧续写视频 · 尾帧/})).toBeVisible();
 expect(after.runs).toEqual(before.runs);expect(networkCounter.paidRequests).toHaveLength(0);
 await page.getByRole('button',{name:/连线 .* → 尾帧续写视频 · 尾帧/}).press('Enter');await page.keyboard.press('Delete');
 await expect(page.getByRole('button',{name:/连线 .* → 尾帧续写视频 · 尾帧/})).not.toBeVisible();
 await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(page.getByRole('button',{name:/连线 .* → 尾帧续写视频 · 尾帧/})).toBeVisible();
 await page.reload();await expect(page.getByRole('button',{name:'输出尾帧',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'隐藏节点列表',exact:true}).click();await page.getByRole('button',{name:'适配全部',exact:true}).click();
 await page.screenshot({path:'work/qa-20261005/video-lineage/isolated-tail-source.png'});
});
test('QA48 modify result restores frozen prompt and creates editable new version without modifying original or submitting',async({page,networkCounter})=>{
 const before=await stored(page);await page.getByRole('button',{name:'修改并重新生成',exact:true}).click({timeout:4000});
 const dialog=page.getByRole('dialog',{name:'修改并重新生成',exact:true});await expect(dialog.getByLabel('修改后的提示词',{exact:true})).toHaveValue('人物走向门口，品牌汉字康济健葆');
 await dialog.getByLabel('修改后的提示词',{exact:true}).fill('人物微笑着推开大门，保留品牌汉字康济健葆');await dialog.getByRole('button',{name:'确认修改并进入画布',exact:true}).click();await expect(page).toHaveURL(/\/canvas\?node=/);
 const after=await stored(page),text=after.graph.nodes.find((n:{title:string})=>n.title==='修改提示词'),video=after.graph.nodes.find((n:{title:string})=>n.title==='修改后的视频');expect(text.data.text).toContain('微笑着推开');expect(video.data.draft).toEqual({modelId:'fake-video-only',durationSeconds:5,ratio:'9:16'});expect(video.data.revisionSource).toMatchObject({runId:'r1',assetId:'result-asset-1'});
 expect(after.runs).toEqual(before.runs);expect(after.assets).toEqual(before.assets);expect(after.graph.nodes.find((n:{id:string})=>n.id==='result-ref')).toEqual(before.graph.nodes.find((n:{id:string})=>n.id==='result-ref'));expect(networkCounter.paidRequests).toHaveLength(0);
 await expect(page.getByRole('link',{name:'查看原版本',exact:true})).toBeVisible();await page.getByRole('link',{name:'查看原版本',exact:true}).click();await expect(page).toHaveURL(/results\?runId=r1$/);
});
test('QA48 modify cancel and transaction quota failure preserve original clip, graph and history',async({page,networkCounter})=>{
 const before=await stored(page);await page.getByRole('button',{name:'修改并重新生成',exact:true}).click();let dialog=page.getByRole('dialog',{name:'修改并重新生成',exact:true});await dialog.getByLabel('修改后的提示词',{exact:true}).fill('不保存的修改');await dialog.getByRole('button',{name:'取消',exact:true}).click();expect(await stored(page)).toEqual(before);
 await page.getByRole('button',{name:'修改并重新生成',exact:true}).click();dialog=page.getByRole('dialog',{name:'修改并重新生成',exact:true});await expect(dialog.getByLabel('修改后的提示词',{exact:true})).toHaveValue('人物走向门口，品牌汉字康济健葆');
 await page.evaluate(()=>{const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args:Parameters<typeof put>){if(this.name==='graphs')throw new DOMException('revision-test-quota','QuotaExceededError');return put.apply(this,args);};});
 await dialog.getByRole('button',{name:'确认修改并进入画布',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('未保存');expect(await stored(page)).toEqual(before);expect(networkCounter.paidRequests).toHaveLength(0);
});
test('QA48 revision copies original references and aliases, while archived projects cannot create revisions',async({page,networkCounter})=>{
 await page.evaluate(async()=>{const path='/src/infrastructure/storage/database.ts',d=await import(path),db=await d.openStudioDb();try{await d.transact(db,['runs'],'readwrite',async(tx:IDBTransaction)=>{const run=await d.requestResult(tx.objectStore('runs').get('r1'));tx.objectStore('runs').put({...run,inputSnapshot:{...run.inputSnapshot,prompt:'参考@视频1的人物继续前进',references:[{assetId:'result-asset-2',mediaType:'video',role:'参考',alias:'@视频1',runId:'r2'}]}});});}finally{db.close();}});
 await page.reload();await page.getByRole('button',{name:'修改并重新生成',exact:true}).click();const dialog=page.getByRole('dialog',{name:'修改并重新生成',exact:true});await dialog.getByRole('button',{name:'确认修改并进入画布',exact:true}).click();await expect(page).toHaveURL(/canvas\?node=/);const after=await stored(page),node=after.graph.nodes.find((n:{title:string})=>n.title==='修改后的视频'),text=after.graph.nodes.find((n:{title:string})=>n.title==='修改提示词');expect(text.data.referenceTokens[0]).toMatchObject({assetId:'result-asset-2',alias:'@视频1'});expect(node.data.inputBindings.map((i:{assetId?:string})=>i.assetId).filter(Boolean)).toEqual(['result-asset-2']);
 await page.goto('/projects/p1/results?runId=r1');await page.evaluate(async()=>{const path='/src/infrastructure/storage/database.ts',d=await import(path),db=await d.openStudioDb();try{await d.transact(db,['projects'],'readwrite',async(tx:IDBTransaction)=>{const p=await d.requestResult(tx.objectStore('projects').get('p1'));tx.objectStore('projects').put({...p,archived:true});});}finally{db.close();}});await page.reload();await expect(page.getByRole('button',{name:'修改并重新生成',exact:true})).toBeDisabled();expect(networkCounter.paidRequests).toHaveLength(0);
});
