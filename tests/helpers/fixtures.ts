import type {Project} from '../../src/domain/project';
import type {Graph} from '../../src/domain/graph';
import type {Run} from '../../src/domain/run';
import type {Asset} from '../../src/domain/asset';
import type {PromptCompileInput,PromptDraft,PromptCompileResult} from '../../src/domain/prompt';
import type {CapabilityProfile,ConnectionProfile} from '../../src/domain/connection';
const promptInput=(patch:Partial<PromptCompileInput>={}):PromptCompileInput=>({userRequest:'原创测试创意',sceneId:'advertisement',requestedSpec:{ratio:'4:5',durationSeconds:5},audioPlan:'无对白',lockedConstraints:[],references:[],...patch});
const unknownCaps=():CapabilityProfile=>({contractVersion:'unverified',verification:'unknown',textModels:[],videoModels:[],videoAliases:[],videoSpecs:[],workContext:false,continuation:false,imageGeneration:false,audioGeneration:false,cancelVideo:false,backup:false});
export const f={
 project:(patch:Partial<Project>&Record<string,unknown>={}):Project=>({id:'p1',schemaVersion:1,title:'测试项目',description:'',revision:1,createdAt:1000,updatedAt:1000,archived:false,trashedAt:null,tags:[],...patch}),
 graph:(patch:Partial<Graph>={}):Graph=>({projectId:'p1',revision:1,nodes:[],edges:[],viewport:{x:0,y:0,scale:1},...patch}),
 run:(patch:Partial<Run>={}):Run=>({id:'r1',projectId:'p1',nodeId:'n1',graphRevision:1,connectionId:'c1',authBindingId:'binding-a',originSnapshot:'https://core.invalid',idempotencyKey:'fake-idempotency-r1',inputSnapshot:{prompt:'原创本地测试'},executionState:'persisted',queryState:'idle',deliveryState:'not_ready',billingState:'not_provided',createdAt:1000,updatedAt:1000,...patch}),
 asset:(patch:Partial<Asset>={}):Asset=>({id:'a1',sha256:'a'.repeat(64),mediaType:'text',mimeType:'text/plain',bytes:0,blobKey:'blob-a1',title:'原创测试素材',createdAt:1000,...patch}),
 promptInput,
 draft:(patch:Partial<PromptDraft>={}):PromptDraft=>({...promptInput(),id:'d1',revision:1,type:'video',ruleVersion:'test-v1',resultVersions:[],...patch}),
 promptResult:(patch:Partial<PromptCompileResult>={}):PromptCompileResult=>({finalPrompt:'原创本地草稿',shotPlan:[],improvements:[],warnings:[],suggestedSpec:{ratio:'4:5',durationSeconds:5},...patch}),
 unknownCaps,
 caps:(patch:Partial<CapabilityProfile>={}):CapabilityProfile=>({...unknownCaps(),contractVersion:'local-mock-v1',verification:'reviewed',textModels:['fake-text-only'],videoModels:['fake-video-only'],...patch}),
 connection:(patch:Partial<ConnectionProfile>={}):ConnectionProfile=>({id:'c1',name:'本地Mock',proxyBase:'/core-api',originSnapshot:'https://core.invalid',contractVersion:'local-mock-v1',...patch}),
};
