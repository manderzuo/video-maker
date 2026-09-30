import {it,expect} from 'vitest';
import {isAllowedTestUrl} from '../helpers/network-policy.mjs';
import {validateLiveApproval} from '../helpers/live-approval';
it('permits current-origin local blob resources while rejecting foreign or disguised blob origins',()=>{const origin='http://127.0.0.1:4179';expect(isAllowedTestUrl('blob:http://127.0.0.1:4179/local-owned-id',origin)).toBe(true);for(const url of ['blob:https://business.invalid/id','blob:http://127.0.0.1:4180/id','blob:http://127.0.0.1.evil.invalid:4179/id','blob:file:///E:/secret','blob:data:text/plain,test'])expect(isAllowedTestUrl(url,origin)).toBe(false);});
it('rejects public, foreign port, malformed and disguised hosts',()=>{
 for(const url of ['https://business.invalid/v1/models','http://127.0.0.1:4180/v1/models','http://127.0.0.1.evil.invalid:4179','file:///E:/secret','not-url'])expect(isAllowedTestUrl(url,'http://127.0.0.1:4179')).toBe(false);
 expect(isAllowedTestUrl('ws://127.0.0.1:4179','http://127.0.0.1:4179')).toBe(true);
});
it('environment flags alone do not authorize live calls',()=>{expect(validateLiveApproval({})).toBe(false);expect(validateLiveApproval({endpoint:'https://example.invalid',bindingLabel:'test',allowedTextSubmissions:1,allowedVideoSubmissions:0,expiresAt:0,costConstraint:'test'})).toBe(false);});
