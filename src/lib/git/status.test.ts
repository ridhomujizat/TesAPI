// Run: node src/lib/git/status.test.ts
import assert from 'node:assert';
import { mapGitFileStatus, mapGitFiles } from './status.ts';

assert.deepEqual(mapGitFileStatus({ path: 'collections/c1/requests/r1.json', status: 'modified' }), {
  id: 'collections/c1/requests/r1.json', label: 'r1', path: 'collections/c1/requests/r1.json', status: 'modified', collectionId: 'c1', nodeId: 'r1',
});
assert.equal(mapGitFileStatus({ path: 'collections/c1/requests/r1.theirs.json', status: 'added' }), null);
assert.equal(mapGitFileStatus({ path: '.tesapi-conflict.json', status: 'added' }), null);
assert.equal(mapGitFileStatus({ path: 'collections/c1/tree.json', status: 'modified' })?.structural, true);
assert.equal(mapGitFileStatus({ path: 'environments.json', status: 'deleted' })?.label, 'Environments');
assert.equal(mapGitFiles([
  { path: 'collections/c1/requests/r1.json', status: 'added' },
  { path: 'collections/c1/tree.json', status: 'modified' },
]).length, 2);

console.log('status.test.ts: all assertions passed');
