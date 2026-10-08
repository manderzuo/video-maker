import {it,expect,vi} from 'vitest';
import {z} from 'zod';
import {ApiError,apiMessage,requestJson} from '../../src/infrastructure/api/client';
import {createSessionStore,type UserSessionView} from '../../src/infrastructure/api/session';
import {defaultPreferences,getPreferences} from '../../src/features/settings/preferences-store';
const a={user:{id:'11111111-1111-4111-8111-111111111111',username:'Fake_A'},contextId:'a'.repeat(43),csrfToken:'c'.repeat(43),onboardingCompletedAt:null} satisfies UserSessionView;
const b={...a,user:{id:'22222222-2222-4222-8222-222222222222',username:'Fake_B'},contextId:'b'.repeat(43),csrfToken:'d'.repeat(43)};
const preferences=(()=>{const {lastVisitedPage:_,defaultTextModel:__,defaultVideoModel:___,...value}=defaultPreferences;void _;void __;void ___;return value;})();
const doc=(theme:'dark'|'light'='dark',revision=0)=>({revision,onboardingCompletedAt:null,lastVisitedPage:'/projects',preferences:{...preferences,theme}});
const response=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
it('business request carries captured context and CSRF without user ownership or credentials in URL',async()=>{
 const fetcher=vi.fn<typeof fetch>().mockResolvedValue(response({ok:true}));await requestJson('/studio-api/me/document',z.strictObject({ok:z.boolean()}),{method:'PATCH',identity:a,body:{expectedRevision:0},fetcher});const [url,init]=fetcher.mock.calls[0];expect(url).toBe('/studio-api/me/document');expect(init).toMatchObject({credentials:'same-origin',mode:'same-origin',cache:'no-store',redirect:'error',headers:{'X-Workspace-Context':a.contextId,'X-CSRF-Token':a.csrfToken}});expect(init?.headers).not.toHaveProperty('Cookie');expect(init?.body).toBe('{"expectedRevision":0}');
});
it('external paths and unknown reflected errors cannot leak response text',async()=>{
 const fetcher=vi.fn<typeof fetch>().mockResolvedValue(response({code:'FAKE_PRIVATE_SECRET',message:'FAKE_PRIVATE_LOG'},500));await expect(requestJson('https://fake.invalid/studio-api/session',z.unknown(),{fetcher})).rejects.toMatchObject({code:'INVALID_REQUEST'});expect(fetcher).not.toHaveBeenCalled();let error:unknown;try{await requestJson('/studio-api/session',z.unknown(),{fetcher});}catch(caught){error=caught;}expect(error).toMatchObject({code:'INTERNAL_ERROR'});expect(apiMessage(error)).not.toContain('FAKE_PRIVATE');
});
it('session refresh rejects a delayed previous-account document even if transport ignores AbortSignal',async()=>{
 let release!:(value:Response)=>void;const late=new Promise<Response>(resolve=>{release=resolve;});const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(response(a)).mockImplementationOnce(()=>late).mockResolvedValueOnce(response(b)).mockResolvedValueOnce(response(doc()));const store=createSessionStore(fetcher);const old=store.refresh();await vi.waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2));await store.refresh();release(response(doc('light')));await old;const state=store.getState();expect(state.status).toBe('authenticated');if(state.status==='authenticated'){expect(state.session.user.id).toBe(b.user.id);expect(state.document.preferences.theme).toBe('dark');}expect(getPreferences().theme).toBe('dark');expect(fetcher.mock.calls[1][1]?.signal?.aborted).toBe(true);
});
it('a delayed A write cannot replace B state or preferences after refresh',async()=>{
 let release!:(value:Response)=>void;const late=new Promise<Response>(resolve=>{release=resolve;});const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(response(a)).mockResolvedValueOnce(response(doc())).mockImplementationOnce(()=>late).mockResolvedValueOnce(response(b)).mockResolvedValueOnce(response(doc()));const store=createSessionStore(fetcher);await store.refresh();const pending=store.saveDocument({expectedRevision:0,preferences:{...preferences,theme:'light'}});const rejected=expect(pending).rejects.toMatchObject({code:'STALE_RESPONSE'});await vi.waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(3));await store.refresh();release(response(doc('light',1)));await rejected;const state=store.getState();if(state.status!=='authenticated')throw new Error('Missing B session');expect(state.session.contextId).toBe(b.contextId);expect(state.document.revision).toBe(0);expect(getPreferences().theme).toBe('dark');
});
it('same-context focus check retains the document and edit boundary without a second document load',async()=>{
 const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(response(a)).mockResolvedValueOnce(response(doc('light'))).mockResolvedValueOnce(response(a));const store=createSessionStore(fetcher);await store.refresh();const previous=store.getState();await store.checkSession();expect(store.getState()).toBe(previous);expect(fetcher).toHaveBeenCalledTimes(3);expect(getPreferences().theme).toBe('light');
});
it('SESSION_CHANGED on a business response clears authenticated data and preferences',async()=>{
 const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(response(a)).mockResolvedValueOnce(response(doc('light'))).mockResolvedValueOnce(response({code:'SESSION_CHANGED'},409));const store=createSessionStore(fetcher);await store.refresh();await expect(store.saveDocument({expectedRevision:0,lastVisitedPage:'/settings/appearance'})).rejects.toMatchObject({code:'SESSION_CHANGED'});expect(store.getState().status).toBe('anonymous');expect(getPreferences().theme).toBe('dark');expect(store.getState()).not.toHaveProperty('document');
});
it('invalid document response never creates authenticated state or imports model defaults',async()=>{
 const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(response(a)).mockResolvedValueOnce(response({...doc('light'),preferences:{...preferences,theme:'light',defaultTextModel:'FAKE_PRIVATE_MODEL'}}));const store=createSessionStore(fetcher);await store.refresh();expect(store.getState().status).toBe('error');expect(store.getState()).not.toHaveProperty('document');expect(getPreferences().defaultTextModel).toBe('');expect(getPreferences().theme).toBe('dark');
});
it('failed authentication feedback survives the checking-state form unmount',async()=>{
 const fetcher=vi.fn<typeof fetch>().mockResolvedValue(response({code:'AUTH_INVALID'},401));const store=createSessionStore(fetcher);await expect(store.authenticate('login',{username:'Fake_A',password:'Fake incorrect password'},{csrfToken:'e'.repeat(43),expiresAt:'2026-10-08T23:59:59Z'})).rejects.toBeInstanceOf(ApiError);expect(store.getState()).toEqual({status:'anonymous',message:'用户名或密码不正确。'});
});
it('preferences import and legacy memory adapter never read or write old localStorage',async()=>{
 const getItem=vi.fn(()=>{throw new Error('OLD_PRIVATE_STORAGE');}),setItem=vi.fn(()=>{throw new Error('OLD_PRIVATE_STORAGE');});vi.stubGlobal('localStorage',{getItem,setItem});try{vi.resetModules();const module=await import('../../src/features/settings/preferences-store');expect(module.getPreferences().theme).toBe('dark');expect(module.savePreferences({theme:'light'})).toEqual({persisted:false});expect(getItem).not.toHaveBeenCalled();expect(setItem).not.toHaveBeenCalled();}finally{vi.unstubAllGlobals();}
});
