import {test} from '../helpers/network-guard';
test('intentional negative probe must fail CI even when fetch error is caught',async({page})=>{
 await page.goto('/');
 await page.evaluate(async()=>{try{await fetch('https://business.invalid/v1/videos/generations',{method:'POST'});}catch{/* Negative probe catches the browser error; the guard must still fail. */}});
});
