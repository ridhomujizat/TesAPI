// Run: node src/components/layout/sidebar/collectionSidebarModel.test.ts (Node >=22)
import assert from 'node:assert';
import { buildMoveLocations, buildRows } from './collectionSidebarModel.ts';

const request = { id: 'request', collectionId: 'collection', parentId: 'folder', type: 'request' as const, name: 'List users', request: { id: 'draft', name: 'List users', method: 'GET' as const, url: 'https://example.com/users', params: [], headers: [], body: { type: 'none' as const }, auth: { type: 'none' as const } } };
const folder = { id: 'folder', collectionId: 'collection', parentId: null, type: 'folder' as const, name: 'Users' };
const state = {
  summaries: [{ id: 'collection', name: 'API', requestCount: 1, folderCount: 1 }],
  collectionsById: { collection: { nodesById: { folder, request }, childIdsByParent: { __root__: ['folder'], folder: ['request'] } } },
  expandedIds: { collection: true, folder: true },
};

assert.deepEqual(buildRows(state, '').map((row) => row.type), ['collection', 'folder', 'request']);
assert.deepEqual(buildRows(state, 'example').map((row) => row.key), ['collection:request']);
assert.deepEqual(buildMoveLocations(state, { sourceCollectionId: 'collection', nodeId: 'request', location: '' }, () => false).map((item) => item.value), ['collection|', 'collection|folder']);

console.log('collectionSidebarModel.test.ts: all assertions passed');
