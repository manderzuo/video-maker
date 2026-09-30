import {spawnSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
const r=spawnSync(process.execPath,['node_modules/@playwright/test/cli.js','test','-c','tests/fixtures/negative.config.ts'],{encoding:'utf8',env:process.env});
writeFileSync('docs/review/logs/T03-network-negative.log',(r.stdout||'')+(r.stderr||''));
if(r.status!==1||!r.stdout.includes('Unauthorized network requests must fail CI'))throw new Error('Negative probe did not fail for the required network guard reason');
console.log('Observed negative browser test exit 1 at network guard, then verified the harness assertion.');
