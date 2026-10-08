import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {AuthBoundary} from '../../src/features/auth/AuthBoundary';
const harness=vi.hoisted(()=>({path:'/',effects:[] as Array<()=>void|(()=>void)>,navigate:vi.fn()}));
vi.mock('react',async importOriginal=>({...await importOriginal<typeof import('react')>(),useEffect:(effect:()=>void|(()=>void))=>{harness.effects.push(effect);},useSyncExternalStore:()=>({status:'anonymous'})}));
vi.mock('../../src/app/routes',()=>({useRoute:()=>harness.path,navigate:harness.navigate,LocalLink:()=>null}));
vi.mock('../../src/infrastructure/api/session',()=>({sessionStore:{start:()=>()=>{},subscribe:vi.fn(),getState:vi.fn()}}));
vi.mock('../../src/features/settings/preferences-store',async importOriginal=>({...await importOriginal<typeof import('../../src/features/settings/preferences-store')>(),applyPreferencesToDocument:vi.fn()}));
beforeEach(()=>{harness.effects=[];harness.navigate.mockClear();vi.stubGlobal('document',{title:''});vi.stubGlobal('matchMedia',()=>({addEventListener:vi.fn(),removeEventListener:vi.fn()}));});
afterEach(()=>{vi.unstubAllGlobals();});
function visit(path:string){harness.path=path;AuthBoundary();for(const effect of harness.effects)effect();}
it.each(['/','/projects','/projects/FAKE_PROJECT/canvas','/settings/connections','/welcome?from=private'])('anonymous entry %s redirects to register',path=>{visit(path);expect(harness.navigate).toHaveBeenCalledExactlyOnceWith('/register');});
it.each(['/login','/register','/login?from=private'])('explicit auth entry %s stays reachable',path=>{visit(path);expect(harness.navigate).not.toHaveBeenCalled();});
