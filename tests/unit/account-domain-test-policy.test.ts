import {expect,it} from 'vitest';
import {createDomainLoopbackPolicy,assertDomainLoopbackPolicy,createPinnedLookup,assertDomainSandboxEnvironment,validateDomainPeer,domainOrigin} from '../../scripts/account-domain-test-policy.mjs';
it('permits only the sealed fixed domain/port/IPv4 policy, never caller-supplied targets',()=>{
 const policy=createDomainLoopbackPolicy();expect(policy).toMatchObject({origin:domainOrigin,hostname:'studio.gemstory.cn',address:'127.0.0.1',port:8443});expect(Object.isFrozen(policy)).toBe(true);expect(assertDomainLoopbackPolicy(policy)).toBe(policy);
 expect(()=>assertDomainLoopbackPolicy({...policy})).toThrow();expect(()=>assertDomainLoopbackPolicy({origin:'https://example.com'})).toThrow();
});
it.each(['studio.gemstory.cn','localhost','127.0.0.1'])('pins %s in Node requests without changing hosts or trust',async hostname=>{
 const result=await new Promise(resolve=>{createPinnedLookup()(hostname,{all:false},(error,address,family)=>resolve({error,address,family}));});expect(result).toEqual({error:null,address:'127.0.0.1',family:4});
});
it.each(['api.example.com','49.232.128.118','studio.gemstory.cn.evil','STUDIO.GEMSTORY.CN'])('refuses unreviewed DNS %s without external resolution',async hostname=>{
 const error=await new Promise(resolve=>createPinnedLookup()(hostname,{all:true},error=>resolve(error)));expect(error).toMatchObject({code:'ENOTFOUND'});
});
it('preserves all-address lookup shape while forcing IPv4 loopback',async()=>{
 const result=await new Promise(resolve=>createPinnedLookup()('studio.gemstory.cn',{all:true,family:6},(error,addresses)=>resolve({error,addresses})));expect(result).toEqual({error:null,addresses:[{address:'127.0.0.1',family:4}]});
});
it('requires an explicitly prepared Linux sandbox and forbids alternate TLS trust/unsafe environment',()=>{
 expect(()=>assertDomainSandboxEnvironment({STUDIO_ACCOUNT_DOMAIN_SANDBOX:'1'},'linux')).not.toThrow();expect(()=>assertDomainSandboxEnvironment({},'linux')).toThrow();expect(()=>assertDomainSandboxEnvironment({STUDIO_ACCOUNT_DOMAIN_SANDBOX:'1'},'win32')).toThrow();
 for(const extra of[{NODE_TLS_REJECT_UNAUTHORIZED:'0'},{NODE_OPTIONS:'--require bad'},{NODE_EXTRA_CA_CERTS:'fake.pem'},{SSL_CERT_FILE:'fake.pem'},{SSL_CERT_DIR:'fake'}])expect(()=>assertDomainSandboxEnvironment({STUDIO_ACCOUNT_DOMAIN_SANDBOX:'1',...extra},'linux')).toThrow();
});
it('requires a strict authorized TLS peer with the reviewed public fingerprint and hostname SAN',()=>{
 const peer={authorized:true,protocol:'TLSv1.3',subjectaltname:'DNS:studio.gemstory.cn',fingerprint256:'9B:0A:86:5C:3F:7C:E2:83:93:55:43:C4:C1:8E:94:56:BF:A3:B8:D4:3E:2E:DA:AB:92:69:5F:D8:D4:8D:2B:81'};
 expect(()=>validateDomainPeer(peer)).not.toThrow();for(const change of[{authorized:false},{protocol:'TLSv1'},{subjectaltname:'DNS:wrong.test'},{fingerprint256:'FAKE_OTHER_CERT'}])expect(()=>validateDomainPeer({...peer,...change})).toThrow();
});
