import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
/** Fixed seven-case command only. No selectors, config/browser overrides,
 * passthrough arguments, root override or shell expansion.
 * @param {readonly string[]} [argv] */
export function createDomainTestCommand(argv=[]){
 if(!Array.isArray(argv)||argv.length!==0)throw new Error('Fixed domain test scope forbids additional CLI arguments');
 return Object.freeze({executable:process.execPath,cwd:root,args:Object.freeze(['--import',path.join(root,'scripts/account-domain-loopback-loader.mjs'),path.join(root,'node_modules/@playwright/test/cli.js'),'test','--config',path.join(root,'playwright.account-domain.config.ts')])});
}
