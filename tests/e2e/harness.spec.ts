import {test,expect} from '../helpers/network-guard';
test('T03-C03: credential-free app bootstrap and local mock counting',async({page,networkCounter})=>{
 await page.route('**/tests/mock/video',route=>route.fulfill({json:{task:{id:'fake-task'}}}));
 await page.goto('/');
 await expect(page.getByRole('link',{name:'AI WORK Studio',exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'开始你的创作项目'})).toBeVisible();
 await page.screenshot({path:'docs/review/screenshots/T03-bootstrap.png'});
 await page.evaluate(async()=>{await fetch('/tests/mock/video',{method:'POST',body:'{}'});});
 expect(networkCounter.requests.filter(r=>r.url.endsWith('/tests/mock/video')&&r.method==='POST')).toHaveLength(1);
});
