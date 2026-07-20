// Run: node src/lib/git/selection.test.ts
import assert from 'node:assert';
import { canCommitSelection, selectionState, toggleSelection } from './selection.ts';

assert.deepEqual([...toggleSelection(new Set(['a']), ['a', 'b'])].sort(), ['a', 'b']);
assert.deepEqual([...toggleSelection(new Set(['a', 'b']), ['a', 'b'])], []);
assert.equal(canCommitSelection(new Set(['a']), 'message', false), true);
assert.equal(canCommitSelection(new Set(), 'message', false), false);
assert.equal(canCommitSelection(new Set(['a']), '   ', false), false);
assert.equal(canCommitSelection(new Set(['a']), 'message', true), false);
assert.deepEqual(selectionState(new Set(['a']), ['a', 'b']), { checked: false, mixed: true });
assert.deepEqual(selectionState(new Set(['a', 'b']), ['a', 'b']), { checked: true, mixed: false });

console.log('selection.test.ts: all assertions passed');
