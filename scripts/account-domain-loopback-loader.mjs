import {installDomainLoopbackResolver} from './account-domain-test-policy.mjs';
installDomainLoopbackResolver();
const {installDomainAccountApiTransport}=await import('../tests/helpers/account-api-transport.mjs');
installDomainAccountApiTransport();
process.env.STUDIO_ACCOUNT_DOMAIN_TEST='1';
