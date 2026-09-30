import {it,expect} from 'vitest';
import {f} from '../helpers/fixtures';
import {validateProject,validateLocalText,validateOutboundText,validateRun,migrateImportedBinding} from '../../src/domain/validation';
import {promptDraftSchema,promptRunSchema} from '../../src/domain/prompt';
import {graphSchema} from '../../src/domain/graph';
it('T04-C01: project names use Unicode characters, preserve text, reject 0/61',()=>{
 for(const title of ['中','中'.repeat(60),'😀'.repeat(60)])expect(validateProject(f.project({title})).ok).toBe(true);
 for(const title of ['',' ','中'.repeat(61),'😀'.repeat(61)])expect(validateProject(f.project({title})).ok).toBe(false);
 expect(validateProject(f.project({description:'中'.repeat(500)})).ok).toBe(true);
 expect(validateProject(f.project({description:'中'.repeat(501)})).ok).toBe(false);
});
it('only explicit import migrates non-secret binding aliases; conflicts fail',()=>{
 const legacy={connectionId:'c1',credentialBindingId:'b1',originSnapshot:'https://core.invalid'};
 expect(migrateImportedBinding(legacy)).toEqual({ok:true,value:{connectionId:'c1',authBindingId:'b1',originSnapshot:'https://core.invalid'}});
 expect(migrateImportedBinding({...legacy,authBindingId:'different'}).ok).toBe(false);
 expect(legacy.credentialBindingId).toBe('b1');
});
it('strict prompt and graph discriminators reject secret fields and unknown node kinds',()=>{
 const input={userRequest:'中文创意',sceneId:'ad',requestedSpec:{ratio:'4:5'},audioPlan:'原对白',lockedConstraints:[],references:[],id:'d1',revision:1,type:'video',ruleVersion:'1',resultVersions:[]};
 expect(promptDraftSchema.safeParse(input).success).toBe(true);
 expect(promptDraftSchema.safeParse({...input,token:'fake'}).success).toBe(false);
 const graph={projectId:'p1',revision:1,nodes:[{id:'n1',type:'unknown-script',title:'',x:0,y:0,locked:false,data:{kind:'unknown-script'}}],edges:[],viewport:{x:0,y:0,scale:1}};
 expect(graphSchema.safeParse(graph).success).toBe(false);
 expect(promptRunSchema.safeParse({connectionId:'c1',authBindingId:'b1',originSnapshot:'https://core.invalid',id:'pr1',draftId:'d1',draftRevision:1,mode:'ai',textModelId:'text-only',idempotencyKey:'fake-key',requestSnapshot:'{"authorization":"Bearer fake"}',executionState:'persisted',billingState:'not_provided',startedAt:1000}).success).toBe(false);
});
it('T04-C02: tag count and Unicode length limits',()=>{
 expect(validateProject(f.project({tags:['中'.repeat(24)]})).ok).toBe(true);
 for(const tags of [[''],['中'.repeat(25)],Array.from({length:11},(_,i)=>`标签${i}`)])expect(validateProject(f.project({tags})).ok).toBe(false);
});
it('T04-C03: 64KiB local limit counts UTF-8 bytes independently',()=>{
 expect(validateLocalText('a'.repeat(65536)).ok).toBe(true);
 expect(validateLocalText('a'.repeat(65537)).ok).toBe(false);
 expect(validateLocalText('中'.repeat(21845)).ok).toBe(true);
 expect(validateLocalText('中'.repeat(21846)).ok).toBe(false);
});
it('T04-C04: confirmed outbound byte limits never truncate',()=>{
 expect(validateOutboundText('😀',4).ok).toBe(true);
 expect(validateOutboundText('😀',3).ok).toBe(false);
 expect(validateOutboundText('中',undefined).ok).toBe(false);
});
it('T04-C05: newer schema and secrets cannot become writable project data',()=>{
 const newer={...f.project(),schemaVersion:2};expect(validateProject(newer).ok).toBe(false);expect(newer.schemaVersion).toBe(2);
 expect(validateProject(f.project({apiKey:'fake-key-only'})).ok).toBe(false);
 expect(validateProject(f.project({revision:-1})).ok).toBe(false);
});
it('four-dimensional run state and requested/execution specs stay separate',()=>{
 const run={connectionId:'connection-a',authBindingId:'binding-a',originSnapshot:'https://core.invalid',id:'r1',projectId:'p1',nodeId:'n1',graphRevision:1,idempotencyKey:'fake-idempotency',inputSnapshot:{},executionState:'submit_unknown',queryState:'paused_by_user',deliveryState:'download_failed',billingState:'pending_reconciliation',createdAt:1000,updatedAt:1000,requestedSpec:{modelId:'unverified',ratio:'4:5'},executionSpec:{modelId:'unverified',ratio:'9:16'}};
 expect(validateRun(run).ok).toBe(true);
 expect(validateRun({...run,executionState:'cancelled'}).ok).toBe(false);
 expect(validateRun({...run,inputSnapshot:{authorization:'Bearer fake'}}).ok).toBe(false);
});
