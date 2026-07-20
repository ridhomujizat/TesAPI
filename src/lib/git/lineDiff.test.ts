// Run: node src/lib/git/lineDiff.test.ts
import assert from 'node:assert';
import { lineDiff } from './lineDiff.ts';

const changed = lineDiff({ method: 'GET', url: '/old' }, { method: 'GET', url: '/new' });
assert(changed.some((row) => row.kind === 'changed' && row.before?.includes('/old') && row.after?.includes('/new')));

const folded = lineDiff({ a: 1, b: 2, c: 3, d: 4, e: 5 }, { a: 1, b: 2, c: 3, d: 4, e: 5 });
assert.equal(folded[0]?.kind, 'fold');
assert.equal(folded[0]?.count, 7);
assert.equal(folded[0]?.lines?.length, 7);

const added = lineDiff(null, { method: 'POST' });
assert(added.every((row) => row.before == null));

const deleted = lineDiff({ method: 'DELETE' }, null);
assert(deleted.every((row) => row.after == null));

console.log('lineDiff.test.ts: all assertions passed');
