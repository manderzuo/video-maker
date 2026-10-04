import path from 'node:path';
import {tmpdir} from 'node:os';
export function testDownloadDirectory(scope:string){
 if(!/^[a-z-]{1,40}$/.test(scope))throw Error('test_download_scope_invalid');
 const root=process.env.STUDIO_TEST_DOWNLOAD_DIR??path.join(tmpdir(),'aiwork-studio-test-downloads',String(process.pid));
 return path.resolve(root,scope);
}
