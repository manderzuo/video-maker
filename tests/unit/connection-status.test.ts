import {beforeEach,it,expect} from 'vitest';
import * as credentials from '../../src/security/credential-session';
import {f} from '../helpers/fixtures';
import {createAuthBinding} from '../../src/domain/authorization';
import type {CoreClient} from '../../src/adapters/core/http-client';
import {setActiveCore,clearActiveCore} from '../../src/adapters/core/current-connection';
import {setActiveText,clearActiveText} from '../../src/adapters/text/current-text';
import {unverifiedCapabilities} from '../../src/domain/connection';
const modulePath='../../src/features/settings/connection-status';
const status=await import(/* @vite-ignore */ modulePath).catch(()=>undefined);
beforeEach(()=>{credentials.clearSessionCredentials();clearActiveCore();clearActiveText();status?.resetConnectionStatus();});
it('connection success clearly separates API access from actual generation verification',()=>{
 const base={configured:true,authorized:true,readonlyVerified:true};
 expect(status!.deriveConnectionStatus(base).label).toBe('已连接 · 生成待验证');
 expect(status!.deriveConnectionStatus({...base,generationVerified:true}).label).toBe('真实生成已验证');
 expect(status!.deriveConnectionStatus({...base,authorized:false}).label).not.toContain('已连接');
});
it('credential changes notify observers without exposing Key material',()=>{
 const api=credentials as typeof credentials&{subscribeSessionCredentials?:(f:()=>void)=>()=>void;credentialRevision?:(id:string)=>number};
 expect(api.subscribeSessionCredentials).toBeTypeOf('function');expect(api.credentialRevision).toBeTypeOf('function');
 const id=crypto.randomUUID(),events:number[]=[];const stop=api.subscribeSessionCredentials!(()=>events.push(api.credentialRevision!(id)));
 credentials.setSessionCredential(id,'fake-status-key');credentials.forgetSessionCredential(id);stop();credentials.setSessionCredential(id,'fake-status-key');
 expect(events).toHaveLength(2);expect(events[1]).toBeGreaterThan(events[0]);expect(JSON.stringify(events)).not.toContain('fake-status-key');
});
it('distinguishes missing configuration, missing memory authorization and readonly verification',()=>{
 expect(status?.deriveConnectionStatus).toBeTypeOf('function');const derive=status!.deriveConnectionStatus;
 expect(derive({configured:false,authorized:false}).code).toBe('missing');
 expect(derive({configured:true,authorized:false,readonlyVerified:true}).code).toBe('unauthorized');
 expect(derive({configured:true,authorized:true,readonlyVerified:true}).code).toBe('readonly');
});
it('text catalog still requires explicit model selection and enablement',()=>{
 expect(status?.deriveConnectionStatus).toBeTypeOf('function');const base={configured:true,authorized:true,readonlyVerified:true,channel:'text'};
 expect(status!.deriveConnectionStatus({...base,model:''}).code).toBe('model-required');
 expect(status!.deriveConnectionStatus({...base,model:'text',modelAvailable:true,enabled:false}).code).toBe('enable-required');
 expect(status!.deriveConnectionStatus({...base,model:'text',modelAvailable:false}).code).toBe('model-unavailable');
 expect(status!.deriveConnectionStatus({...base,model:'text',modelAvailable:undefined,enabled:true}).code).toBe('readonly');
});
it('video catalog with an unverified deployment does not claim generation-ready connection',()=>{
 const view=status!.deriveConnectionStatus({configured:true,authorized:true,readonlyVerified:true,channel:'video',model:'seedance',modelAvailable:undefined,capabilityVerified:false});
 expect(view.code).toBe('capability-unverified');
 expect(view.label).toContain('视频能力待核验');
});
it('old generation proof cannot mask checking, failure, stale catalog or lost authorization',()=>{
 expect(status?.deriveConnectionStatus).toBeTypeOf('function');const base={configured:true,authorized:true,readonlyVerified:true,generationVerified:true};
 expect(status!.deriveConnectionStatus(base).code).toBe('generated');
 for(const [patch,code] of [[{checking:true},'checking'],[{failure:'safe'},'failed'],[{stale:true},'unverified'],[{authorized:false},'unauthorized'],[{draftChanged:true},'unverified']] as const)expect(status!.deriveConnectionStatus({...base,...patch}).code).toBe(code);
});
function client(){const profile=f.connection(),binding=createAuthBinding(profile);credentials.setSessionCredential(binding.id,'fake-check-'+binding.id);return {profile,binding} as CoreClient;}
it('duplicate channel checks share one operation and permit only the current result to commit',async()=>{
 expect(status?.runConnectionCheck).toBeTypeOf('function');const c=client(),writes:string[]=[];let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);let calls=0;
 const work=async(ctx:{assertCurrent:()=>void})=>{calls++;await gate;ctx.assertCurrent();writes.push('current');return 1;};
 const first=status!.runConnectionCheck('video',c,work),second=status!.runConnectionCheck('video',c,work);release();expect(await first).toBe(1);expect(await second).toBe(1);expect(calls).toBe(1);expect(writes).toEqual(['current']);
});
it('cleared authorization prevents a late result from writing',async()=>{
 expect(status?.runConnectionCheck).toBeTypeOf('function');const c=client(),writes:string[]=[];let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
 const result=status!.runConnectionCheck('video',c,async(ctx:{assertCurrent:()=>void})=>{await gate;ctx.assertCurrent();writes.push('obsolete');});
 credentials.forgetSessionCredential(c.binding.id);release();await expect(result).rejects.toThrow('connection_check_obsolete');expect(writes).toEqual([]);
});
it('a canceled old check cannot overwrite a replacement or release its busy state',async()=>{
 expect(status?.runConnectionCheck).toBeTypeOf('function');const a=client(),b=client();let releaseA!:()=>void,releaseB!:()=>void;const gateA=new Promise<void>(r=>releaseA=r),gateB=new Promise<void>(r=>releaseB=r),writes:string[]=[];
 const first=status!.runConnectionCheck('video',a,async(ctx:{assertCurrent:()=>void})=>{await gateA;ctx.assertCurrent();writes.push('a');});const rejected=expect(first).rejects.toThrow('connection_check_obsolete');
 status!.cancelConnectionCheck('video');const second=status!.runConnectionCheck('video',b,async(ctx:{assertCurrent:()=>void})=>{await gateB;ctx.assertCurrent();writes.push('b');});releaseA();await rejected;expect(status!.isConnectionChecking('video')).toBe(true);releaseB();await second;expect(writes).toEqual(['b']);expect(status!.isConnectionChecking('video')).toBe(false);
});
it('timeout releases the check and ignores a late transport result',async()=>{
 expect(status?.runConnectionCheck).toBeTypeOf('function');const c=client();let release!:()=>void;const gate=new Promise<void>(r=>release=r),writes:string[]=[];
 await expect(status!.runConnectionCheck('text',c,async(ctx:{assertCurrent:()=>void})=>{await gate;ctx.assertCurrent();writes.push('late');},10)).rejects.toThrow('connection_check_timeout');
 release();await new Promise(r=>setTimeout(r,0));expect(writes).toEqual([]);expect(status!.isConnectionChecking('text')).toBe(false);
});
it('failure text never renders untrusted error text or an ordinary Key',()=>{
 expect(status?.safeConnectionFailure).toBeTypeOf('function');const message=status!.safeConnectionFailure({errorCode:'fake-key-secret',category:'authentication',httpStatus:401,message:'Bearer fake-key-secret'});expect(message).toContain('401');expect(message).not.toContain('fake-key-secret');expect(message).not.toContain('Bearer');
});
it('Core readonly evidence supplies the existing prompt fallback without enabling independent Agent text',()=>{
 const c=client();setActiveCore(c,f.caps());status!.rememberReadonlyStatus('video',c,['fake-text-only','fake-video-only']);const view=status!.connectionStatusView('text');expect(view.code).toBe('readonly');expect(view.fallback).toBe(true);
});
it('an unverified Core catalog cannot claim its text fallback is ready',()=>{const c=client();setActiveCore(c,{...unverifiedCapabilities(),contractVersion:c.profile.contractVersion});status!.rememberReadonlyStatus('video',c,['fake-text-only','fake-video-only']);expect(status!.connectionStatusView('text').code).toBe('fallback-unverified');});
it('QA32 a reviewed video-only Core cannot claim a usable text fallback from its readonly directory',()=>{const c=client();setActiveCore(c,f.caps({textModels:[]}));status!.rememberReadonlyStatus('video',c,['fake-video-only']);expect(status!.connectionStatusView('text').code).toBe('fallback-unverified');});
it('catalog membership alone cannot declare a model available when the reviewed contract excludes it',()=>{
 const c=client();setActiveCore(c,f.caps({videoModels:[]}));status!.rememberReadonlyStatus('video',c,['fake-video-only']);expect(status!.connectionStatusView('video',{model:'fake-video-only'}).code).toBe('model-unavailable');
});
it('approved completion upgrades only matching current authorization/model and ignores mock or obsolete completion',()=>{
 const c=client();setActiveCore(c,f.caps());status!.rememberReadonlyStatus('video',c,['fake-text-only','fake-video-only'],{mock:true});expect(status!.observeGeneration(c,'text','fake-text-only')()).toBe(false);
 status!.rememberReadonlyStatus('video',c,['fake-text-only','fake-video-only']);const complete=status!.observeGeneration(c,'text','fake-text-only');expect(complete()).toBe(true);expect(status!.connectionStatusView('text',{model:'fake-text-only'}).code).toBe('generated');expect(status!.connectionStatusView('text',{model:'other'}).code).not.toBe('generated');credentials.forgetSessionCredential(c.binding.id);expect(complete()).toBe(false);expect(status!.connectionStatusView('text').code).toBe('unauthorized');
});
it('actual authentication rejection invalidates catalog success and a subsequent successful text request recovers it',()=>{
 const c=client();setActiveCore(c,f.caps());status!.rememberReadonlyStatus('video',c,['fake-text-only','fake-video-only']);
 expect(status?.observeGenerationFailure).toBeTypeOf('function');
 const fail=status!.observeGenerationFailure(c,'text'),complete=status!.observeGeneration(c,'text','fake-text-only');
 expect(fail({httpStatus:401})).toBe(true);const view=status!.connectionStatusView('text');
 expect(view.code).toBe('failed');expect(view.failure).toContain('401');expect(view.label).not.toContain('已连接');
 expect(complete()).toBe(true);expect(status!.connectionStatusView('text').code).toBe('generated');
});
it('a late failure cannot invalidate replacement authorization or a mock connection',()=>{
 const c=client();setActiveCore(c,f.caps());status!.rememberReadonlyStatus('video',c,['fake-text-only']);
 expect(status?.observeGenerationFailure).toBeTypeOf('function');const fail=status!.observeGenerationFailure(c,'text');
 const replacement=client();setActiveCore(replacement,f.caps());status!.rememberReadonlyStatus('video',replacement,['fake-text-only']);
 expect(fail({httpStatus:401})).toBe(false);expect(status!.connectionStatusView('text').code).toBe('readonly');
 status!.rememberReadonlyStatus('video',replacement,['fake-text-only'],{mock:true});expect(status!.observeGenerationFailure(replacement,'text')({httpStatus:401})).toBe(false);
});
it('enabling a new text model on the same current binding preserves its in-memory Key',()=>{
 const c=client();c.binding={...c.binding,kind:'text-api'};const caps=f.caps({videoModels:[],videoSpecs:[]});setActiveText(c,caps);setActiveText(c,{...caps,textModels:['other-text']});expect(credentials.hasSessionCredential(c.binding.id)).toBe(true);
});
it('historical/imported video delivery cannot create a current-generation proof without an observed approved submission',()=>{
 expect(status?.completeSubmittedVideo).toBeTypeOf('function');expect(status!.completeSubmittedVideo('historical-run','spec')).toBe(false);
 const c=client();setActiveCore(c,f.caps());status!.rememberReadonlyStatus('video',c,['fake-video-only']);const scope='[5,"9:16",""]';status!.registerSubmittedVideo('current-run',scope,status!.observeGeneration(c,'video','fake-video-only',scope));expect(status!.completeSubmittedVideo('current-run','different-spec')).toBe(false);expect(status!.connectionStatusView('video',{model:'fake-video-only',spec:scope}).code).not.toBe('generated');
 status!.registerSubmittedVideo('current-run',scope,status!.observeGeneration(c,'video','fake-video-only',scope));expect(status!.completeSubmittedVideo('current-run',scope)).toBe(true);expect(status!.completeSubmittedVideo('current-run',scope)).toBe(false);
});
it('multiple reviewed resolutions retain only the actually observed current-generation scope in the status summary',()=>{
 const c=client(),specs=[{modelId:'fake-video-only',durationSeconds:5,ratio:'9:16',resolution:'480p'},{modelId:'fake-video-only',durationSeconds:5,ratio:'9:16',resolution:'720p'}];setActiveCore(c,f.caps({videoSpecs:specs}));status!.rememberReadonlyStatus('video',c,['fake-video-only']);expect(status!.videoStatusSpec('fake-video-only',5,'9:16')).toBeUndefined();
 const scope='[5,"9:16","480p"]';expect(status!.observeGeneration(c,'video','fake-video-only',scope)()).toBe(true);expect(status!.videoStatusSpec('fake-video-only',5,'9:16')).toBe(scope);expect(status!.connectionStatusView('video',{model:'fake-video-only',spec:status!.videoStatusSpec('fake-video-only',5,'9:16')}).code).toBe('generated');expect(status!.connectionStatusView('video',{model:'fake-video-only',spec:'[5,"9:16","720p"]'}).code).not.toBe('generated');expect(status!.videoStatusSpec('fake-video-only',8,'9:16')).toBeUndefined();
 credentials.forgetSessionCredential(c.binding.id);expect(status!.videoStatusSpec('fake-video-only',5,'9:16')).toBeUndefined();credentials.setSessionCredential(c.binding.id,'fake-check-'+c.binding.id);expect(status!.videoStatusSpec('fake-video-only',5,'9:16')).toBeUndefined();
});
