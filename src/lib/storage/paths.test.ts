// Run: node src/lib/storage/paths.test.ts (Node >=22)
import assert from 'node:assert';
import { isSidecarPath } from './paths.ts';

assert.equal(isSidecarPath('requests/request.json.theirs.json'), true);
assert.equal(isSidecarPath('requests/request.json.base.json'), true);
assert.equal(isSidecarPath('.tesapi-conflict.json'), true);
assert.equal(isSidecarPath('requests/request.json'), false);

console.log('paths.test.ts: all assertions passed');
