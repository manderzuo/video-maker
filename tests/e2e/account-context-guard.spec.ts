import {test,expect,type Browser} from '@playwright/test';
import {createAccountNetworkGuard} from '../helpers/account-network-guard';
const origin='http://127.0.0.1:4182';
async function freshContext(browser:Browser){const guard=createAccountNetworkGuard(origin);const context=await guard.newContext(browser);return {context,guard};}
test('context guard: fresh context blocks off-origin HTTP before the local canary receives it',async({browser},testInfo)=>{
 const {context,guard}=await freshContext(browser);try{const page=await context.newPage();await expect(page.goto('http://127.0.0.1:4183/http-probe')).rejects.toThrow(/ERR_BLOCKED_BY_CLIENT/);expect((await (await page.request.get(origin+'/__account-canary-count')).json()).http).toBe(0);expect(guard.evidence()).toMatchObject({contexts:1,blockedRequests:1,paidRequests:0});}finally{testInfo.annotations.push({type:'studio:network-evidence',description:JSON.stringify(guard.evidence())});await context.close();}
});
test('context guard: fresh context blocks off-origin WebSocket before local upgrade reaches canary',async({browser},testInfo)=>{
 const {context,guard}=await freshContext(browser);try{const page=await context.newPage();await page.goto('/__account-guard');await page.evaluate(()=>new Promise<void>(resolve=>{const socket=new WebSocket('ws://127.0.0.1:4183/websocket-probe');socket.onclose=()=>resolve();}));expect((await (await page.request.get(origin+'/__account-canary-count')).json()).websocket).toBe(0);expect(guard.evidence()).toMatchObject({contexts:1,blockedRequests:1,paidRequests:0});}finally{testInfo.annotations.push({type:'studio:network-evidence',description:JSON.stringify(guard.evidence())});await context.close();}
});
test('context guard: fresh context blocks a synthetic same-origin paid-path probe',async({browser},testInfo)=>{
 const {context,guard}=await freshContext(browser);try{const page=await context.newPage();await expect(page.goto(origin+'/completions')).rejects.toThrow(/ERR_BLOCKED_BY_CLIENT/);expect(guard.evidence()).toMatchObject({contexts:1,blockedRequests:1,paidRequests:1});}finally{testInfo.annotations.push({type:'studio:network-evidence',description:JSON.stringify(guard.evidence())});await context.close();}
});
