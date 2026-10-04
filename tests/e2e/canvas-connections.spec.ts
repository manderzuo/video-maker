import {test,expect} from '../helpers/network-guard';
import {seedStudio} from '../helpers/seed-studio';
import type {Page,Locator} from '@playwright/test';

test.beforeEach(async({page})=>{await seedStudio(page,'unverified-capability');await page.goto('/projects/p1/canvas');});
const line=(page:Page)=>page.getByRole('button',{name:'连线 镜头文字 → 视频草稿 · 文本',exact:true});
async function connect(page:Page){
 await page.getByTestId('node-text-1').getByRole('button',{name:'输出文本',exact:true}).click();
 await page.getByTestId('node-video-1').getByRole('button',{name:'接收文本',exact:true}).click();
 await expect(page.getByTestId('node-video-1').getByTestId('input-list').locator('li')).toHaveCount(1);
}
async function center(locator:Locator){const b=await locator.boundingBox();expect(b).not.toBeNull();return {x:b!.x+b!.width/2,y:b!.y+b!.height/2};}
async function stored(page:Page){return page.evaluate(async()=>{
 const path='/src/infrastructure/storage/database.ts',dbModule=await import(path),db=await dbModule.openStudioDb();
 try{return await dbModule.transact(db,['graphs','runs'],'readonly',async(tx:IDBTransaction)=>({graph:await dbModule.requestResult(tx.objectStore('graphs').get('p1')),runs:await dbModule.requestResult(tx.objectStore('runs').getAll())}));}finally{db.close();}
});}

test('connection preview follows drag, highlights compatible inputs and Escape cancels without creating an edge',async({page,networkCounter})=>{
 const from=await center(page.getByRole('button',{name:'输出文本',exact:true})),to=await center(page.getByRole('button',{name:'接收文本',exact:true}));
 await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move((from.x+to.x)/2,to.y,{steps:4});
 await expect(page.getByTestId('connection-preview')).toBeVisible();
 await expect(page.getByRole('button',{name:'接收文本',exact:true})).toHaveAttribute('data-connectable','true');
 await expect(page.getByRole('button',{name:'接收图片',exact:true})).toHaveAttribute('data-connectable','false');
 await page.keyboard.press('Escape');await page.mouse.up();await expect(page.getByTestId('connection-preview')).toHaveCount(0);
 expect((await stored(page)).graph.edges).toHaveLength(0);expect(networkCounter.paidRequests).toHaveLength(0);
});

test('ports on opposite node sides create a typed wire anchored to the actual endpoints',async({page})=>{
 const source=page.getByTestId('node-text-1'),target=page.getByTestId('node-video-1'),a=await source.boundingBox(),b=await target.boundingBox();
 const from=await center(source.getByRole('button',{name:'输出文本',exact:true})),to=await center(target.getByRole('button',{name:'接收文本',exact:true}));
 expect(Math.abs(from.x-(a!.x+a!.width))).toBeLessThan(4);expect(Math.abs(to.x-b!.x)).toBeLessThan(4);
 await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:8});await page.mouse.up();
 await expect(line(page)).toBeVisible();expect((await stored(page)).graph.edges).toHaveLength(1);
});

test('select wire and Delete removes only the binding; undo redo and reload preserve history',async({page,networkCounter})=>{
 const before=await stored(page);await connect(page);await line(page).click();await page.keyboard.press('Delete');
 await expect(page.getByTestId('node-video-1').getByTestId('input-list').locator('li')).toHaveCount(0);
 await expect(page.getByTestId('node-text-1')).toBeVisible();await expect(page.getByTestId('node-video-1')).toBeVisible();
 expect((await stored(page)).runs).toEqual(before.runs);
 await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(line(page)).toBeVisible();
 await page.getByRole('button',{name:'重做',exact:true}).click();await expect(line(page)).toHaveCount(0);
 await page.reload();expect((await stored(page)).graph.edges).toHaveLength(0);expect((await stored(page)).runs).toEqual(before.runs);expect(networkCounter.paidRequests).toHaveLength(0);
});

test('wire context menu disconnects while retaining both nodes',async({page})=>{
 await connect(page);await line(page).click({button:'right'});
 await page.getByRole('menuitem',{name:'断开连接',exact:true}).click();await expect(line(page)).toHaveCount(0);
 expect((await stored(page)).graph.nodes).toHaveLength(6);
});

test('Delete inside text editing keeps a selected wire; click on empty canvas clears wire selection',async({page})=>{
 await connect(page);await line(page).click();await page.getByTestId('node-text-1').getByLabel('节点文本').click();await page.keyboard.press('Delete');await expect(line(page)).toBeVisible();
 await line(page).click();await expect(line(page)).toHaveAttribute('aria-pressed','true');
 const stage=await page.getByTestId('canvas-stage').boundingBox();await page.mouse.click(stage!.x+stage!.width-30,stage!.y+stage!.height-30);
 await expect(line(page)).toHaveAttribute('aria-pressed','false');
});

test('dropping a wire on empty canvas cancels; mismatched type produces no binding',async({page})=>{
 const from=await center(page.getByRole('button',{name:'输出文本',exact:true}));await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(from.x+40,from.y+160,{steps:4});await page.mouse.up();
 await expect(page.getByTestId('connection-preview')).toHaveCount(0);expect((await stored(page)).graph.edges).toHaveLength(0);
 await page.getByRole('button',{name:'输出文本',exact:true}).click();await page.getByRole('button',{name:'接收图片',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:'类型不匹配'})).toBeVisible();expect((await stored(page)).graph.edges).toHaveLength(0);
});

test('locked target cannot lose its connection through wire keyboard or context menu',async({page})=>{
 await connect(page);await page.getByTestId('node-video-1').getByTestId('node-handle').click();await page.getByRole('button',{name:'锁定选中',exact:true}).click();
 await expect(page.getByTestId('node-video-1').getByTestId('node-handle')).toContainText('已锁定');await line(page).click();await page.keyboard.press('Delete');await expect(line(page)).toBeVisible();
 await line(page).click({button:'right'});await expect(page.getByRole('menuitem',{name:'断开连接',exact:true})).toBeDisabled();expect((await stored(page)).graph.edges).toHaveLength(1);
});

test('Space activates ports from the keyboard without starting canvas panning',async({page})=>{
 await page.getByRole('button',{name:'输出文本',exact:true}).focus();await page.keyboard.press('Space');await expect(page.getByTestId('connection-preview')).toBeVisible();
 await page.getByRole('button',{name:'接收文本',exact:true}).focus();await page.keyboard.press('Space');await expect(line(page)).toBeVisible();
 await line(page).focus();await page.keyboard.press('Delete');await expect(line(page)).toHaveCount(0);
});

test('one text node can feed two video drafts; disconnecting one leaves the other bound',async({page,networkCounter})=>{
 await connect(page);await page.getByTestId('node-video-1').getByTestId('node-handle').click();await page.getByRole('button',{name:'复制一份',exact:true}).click();
 const second=page.locator('[data-node-type="video-generation"]:not([data-testid="node-video-1"])');await expect(second).toHaveCount(1);
 await page.getByRole('button',{name:'输出文本',exact:true}).click();await second.getByRole('button',{name:'接收文本',exact:true}).click();
 await expect(second.getByTestId('input-list').locator('li')).toHaveCount(1);expect((await stored(page)).graph.edges).toHaveLength(2);
 await second.getByRole('button',{name:'断开 镜头文字',exact:true}).click();expect((await stored(page)).graph.edges).toHaveLength(1);await page.reload();expect((await stored(page)).graph.edges).toHaveLength(1);expect(networkCounter.paidRequests).toHaveLength(0);
});

test('image wire ends at its image input and keeps its endpoint after zooming and moving the node',async({page})=>{
 await page.getByTestId('node-video-1').getByRole('button',{name:'选择输入',exact:true}).click();await page.getByRole('button',{name:'连接 参考一',exact:true}).click();
 async function endpointMatches(){const endpoints=await page.locator('.canvas-wire.port-image .wire-visible').evaluate(path=>{const numbers=path.getAttribute('d')!.match(/-?\d+(?:\.\d+)?/g)!.map(Number),svgPath=path as SVGPathElement,m=svgPath.getScreenCTM()!,point=new DOMPoint(numbers[numbers.length-2],numbers[numbers.length-1]).matrixTransform(m);return {x:point.x,y:point.y};});const input=await center(page.getByRole('button',{name:'接收图片',exact:true}));expect(Math.abs(input.x-endpoints.x)).toBeLessThan(4);expect(Math.abs(input.y-endpoints.y)).toBeLessThan(4);}
 await endpointMatches();const zoom=page.getByLabel('缩放百分比');await zoom.fill('75');await zoom.press('Enter');await endpointMatches();
 const handle=await center(page.getByTestId('node-video-1').getByTestId('node-handle'));await page.mouse.move(handle.x,handle.y);await page.mouse.down();await page.mouse.move(handle.x+30,handle.y+20,{steps:4});await page.mouse.up();await expect(page.getByText('已保存',{exact:true})).toBeVisible();await endpointMatches();
});

test('selecting a node in the outline clears wire selection so Delete cannot target a stale wire',async({page})=>{
 await connect(page);await line(page).click();await expect(line(page)).toHaveAttribute('aria-pressed','true');
 await page.getByLabel('选择 视频草稿',{exact:true}).check();await expect(page.getByTestId('node-video-1')).toHaveAttribute('aria-selected','true');await expect(line(page)).toHaveAttribute('aria-pressed','false');
 expect((await stored(page)).graph.edges).toHaveLength(1);
});
