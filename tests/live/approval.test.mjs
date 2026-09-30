import {test} from 'node:test';
import assert from 'node:assert/strict';
test('T48 live validation is not authorized or implemented in this batch',{skip:process.env.AIWORK_ALLOW_LIVE!=='1'},()=>{
 assert.fail('Live adapter remains unimplemented; an environment flag cannot authorize business traffic');
});
