import {it,expect,vi,afterEach} from 'vitest';
import {loadRegisteredConnections} from '../../src/infrastructure/deployment/registration';
import {localDeployment} from '../helpers/deployment-fixture';
import {f} from '../helpers/fixtures';
afterEach(()=>vi.unstubAllGlobals());
it('loads registered text proxy targets alongside Core without dropping the entire registry',async()=>{
 const profile=f.connection({id:'registered-text',originSnapshot:'https://text.example.invalid',proxyBase:'/text-api/registered/registered-text',contractVersion:'openai-compatible-text-v1'});
 const entry={profile,contract:{...localDeployment.connections[0].contract,version:profile.contractVersion,textModels:['fake-text-only'],videoModels:[],videoSpecs:[]}};
 vi.stubGlobal('fetch',async()=>new Response(JSON.stringify({...localDeployment,connections:[...localDeployment.connections,entry]}),{headers:{'content-type':'application/json'}}));
 expect((await loadRegisteredConnections(true)).map(e=>e.profile.id)).toEqual(['c1','registered-text']);
});
