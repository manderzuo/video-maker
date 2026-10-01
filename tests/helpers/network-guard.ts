import {test as base,expect} from '@playwright/test';
import {isAllowedTestUrl} from './network-policy.mjs';
import {NetworkCounter} from './network-counter';
export const test=base.extend<{networkCounter:NetworkCounter;networkGuard:void}>({
 networkCounter:async({},use)=>{await use(new NetworkCounter());},
 networkGuard:[async({context,networkCounter},use,testInfo)=>{
  const origin='http://127.0.0.1:4179';
  context.on('request',r=>networkCounter.record(r.url(),r.method(),!isAllowedTestUrl(r.url(),origin)));
  await context.route('**/*',async route=>{
   const r=route.request(),allowed=isAllowedTestUrl(r.url(),origin);
   if(allowed)await route.continue();else await route.abort('blockedbyclient');
  });
  await context.routeWebSocket('**/*',ws=>{
   const allowed=isAllowedTestUrl(ws.url(),origin);
   networkCounter.record(ws.url(),'WS',!allowed);
   if(allowed)ws.connectToServer();else ws.close();
  });
  await use();
  testInfo.annotations.push({type:'studio:network-evidence',description:JSON.stringify(networkCounter.evidence)});
  expect(networkCounter.requests.filter(r=>r.blocked),'Unauthorized network requests must fail CI').toEqual([]);
 },{auto:true}],
});
export {expect};
