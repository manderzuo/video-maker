import type {PlaywrightWorkerOptions,WorkerFixture} from '@playwright/test';
import {assertDomainLocalBrowserConnection} from '../../scripts/account-domain-test-policy.mjs';
export function createDomainLocalBrowserGuard(enabled:boolean):[WorkerFixture<void,Pick<PlaywrightWorkerOptions,'connectOptions'>>,{scope:'worker';auto:true}]{
 return [async({connectOptions},use)=>{if(enabled)assertDomainLocalBrowserConnection(connectOptions);await use();},{scope:'worker',auto:true}];
}
