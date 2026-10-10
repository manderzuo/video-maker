import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {expect,it} from 'vitest';

// Exact bytes registered by the existing cloud-aebd1f5 production database.
// They must survive Git's clean/checkout filters on Windows and Linux alike.
const applied:Record<string,string>={
 '001-users.sql':'292380465c7491e3da34fd3277811ee83e0ff446bb15ae42f7655df9c40006b6',
 '002-api-configs.sql':'011c0851c436e438c4dbe75e1a073a242bed6970781f4fdc432e6ec559e65351',
 '003-workspace.sql':'6fcb8568ddfb4a404d1d93a3d961878dfb73edd7c77157ddd0ed7530e3333852',
 '004-tasks-history.sql':'f189b6e9de17997cdf05a8f0c307193a635a6f460e31fbe0e81e0f3b66cc601b',
 '005-video-runs.sql':'0d34f79eb0bad2bb3ba3259663c89f50bdf7a2f00dc0b98d4a2cebfb7be5d699',
 '006-agent.sql':'9b302346e6be12f4a6cc68aea4ea1d7c57bb02efb420aa3dfe660c686b9df7c5',
 '007-workspace-imports.sql':'865fc26f532359d52561b16326c9fe002ba3e9214aed07ba6368a9f52ff8c597'
};
it('preserves already-applied production migration bytes through Git filters',()=>{
 const root=resolve('..');
 for(const [name,sha256] of Object.entries(applied)){
  const relative='server/src/db/migrations/'+name,bytes=readFileSync(resolve(root,relative));
  expect(createHash('sha256').update(bytes).digest('hex'),name+' applied checksum').toBe(sha256);
  const rawBlob=createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');
  const stored=execFileSync('git',['hash-object','--path='+relative,'--stdin'],{cwd:root,input:bytes,encoding:'utf8',windowsHide:true}).trim();
  expect(stored,name+' Git must store the immutable SQL bytes').toBe(rawBlob);
  const indexed=execFileSync('git',['show',':'+relative],{cwd:root,windowsHide:true});
  expect(createHash('sha256').update(indexed).digest('hex'),name+' tracked blob must retain the applied checksum').toBe(sha256);
 }
});
