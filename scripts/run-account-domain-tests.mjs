import {spawn} from 'node:child_process';
import {probeDomainTls,assertDomainSandboxEnvironment,assertDomainAdapterExecutionReady} from './account-domain-test-policy.mjs';
import {createDomainTestCommand} from './account-domain-launch-policy.mjs';
// Requires a separately reviewed, already running isolated TLS/Vite environment.
// Does not create it, read private keys, change trust, open ports or deploy.
assertDomainAdapterExecutionReady();
assertDomainSandboxEnvironment();
const command=createDomainTestCommand(process.argv.slice(2));
console.log(JSON.stringify({preflight:await probeDomainTls(),scope:'Strict domain TLS adapter; isolated real PostgreSQL and synthetic upstream; not production'}));
process.exitCode=await new Promise((resolve,reject)=>{const child=spawn(command.executable,command.args,{cwd:command.cwd,stdio:'inherit',shell:false,windowsHide:true});child.once('error',reject);child.once('close',code=>resolve(code??1));});
