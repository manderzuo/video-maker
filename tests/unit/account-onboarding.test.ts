import {it,expect,vi} from 'vitest';
import {createSessionStore} from '../../src/infrastructure/api/session';
import {defaultPreferences} from '../../src/features/settings/preferences-store';
const session={user:{id:'11111111-1111-4111-8111-111111111111',username:'Fake_A'},contextId:'a'.repeat(43),csrfToken:'b'.repeat(43),onboardingCompletedAt:null};
const {lastVisitedPage:_,defaultTextModel:__,defaultVideoModel:___,...preferences}=defaultPreferences;void _;void __;void ___;
const doc={revision:0,preferences,lastVisitedPage:'/projects',onboardingCompletedAt:null};
const completed={...doc,revision:1,onboardingCompletedAt:'2026-10-08T16:00:00.000Z'};
const response=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status});
it('completes onboarding only after the server accepts captured identity and expected revision',async()=>{
 const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(response(session)).mockResolvedValueOnce(response(doc)).mockResolvedValueOnce(response(completed));const store=createSessionStore(fetcher);await store.refresh();expect(typeof store.completeOnboarding).toBe('function');await store.completeOnboarding();expect(fetcher.mock.calls[2][0]).toBe('/studio-api/me/onboarding');expect(fetcher.mock.calls[2][1]).toMatchObject({method:'PATCH',headers:{'X-Workspace-Context':session.contextId,'X-CSRF-Token':session.csrfToken}});expect(JSON.parse(fetcher.mock.calls[2][1]?.body as string)).toEqual({expectedRevision:0,completed:true});expect(store.getState()).toMatchObject({status:'authenticated',document:completed,busy:false});
});
it('failed onboarding stays incomplete and an A response cannot adopt data after switching to B',async()=>{
 let release!:(value:Response)=>void;const late=new Promise<Response>(resolve=>{release=resolve;});const b={...session,user:{id:'22222222-2222-4222-8222-222222222222',username:'Fake_B'},contextId:'c'.repeat(43)};const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(response(session)).mockResolvedValueOnce(response(doc)).mockResolvedValueOnce(response({code:'REVISION_CONFLICT'},409)).mockImplementationOnce(()=>late).mockResolvedValueOnce(response(b)).mockResolvedValueOnce(response(doc));const store=createSessionStore(fetcher);await store.refresh();expect(typeof store.completeOnboarding).toBe('function');await expect(store.completeOnboarding()).rejects.toMatchObject({code:'REVISION_CONFLICT'});expect(store.getState()).toMatchObject({document:{onboardingCompletedAt:null},busy:false});const pending=store.completeOnboarding(),rejected=expect(pending).rejects.toMatchObject({code:'STALE_RESPONSE'});await store.refresh();release(response(completed));await rejected;expect(store.getState()).toMatchObject({session:{contextId:b.contextId},document:{onboardingCompletedAt:null}});
});
