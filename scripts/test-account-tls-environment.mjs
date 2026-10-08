import assert from 'node:assert/strict';
import {assertStrictTlsEnvironment} from './account-tls-environment.mjs';
assert.doesNotThrow(()=>assertStrictTlsEnvironment({}));
assert.doesNotThrow(()=>assertStrictTlsEnvironment({NODE_TLS_REJECT_UNAUTHORIZED:'1'}));
assert.throws(()=>assertStrictTlsEnvironment({NODE_TLS_REJECT_UNAUTHORIZED:'0'}),/Strict TLS/);
assert.throws(()=>assertStrictTlsEnvironment({NODE_OPTIONS:'--require unsafe.js'}),/Strict TLS/);
console.log('Strict TLS environment checks: 4/4; certificate operations: 0');
