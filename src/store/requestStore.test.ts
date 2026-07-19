// Run: node src/store/requestStore.test.ts (Node >=22)
import assert from 'node:assert';
import { isTabDirty } from '../lib/collections.ts';
import { newRequest, useRequestStore } from './requestStore.ts';

const saved = { ...newRequest(), id: 'saved', name: 'List items', url: 'https://example.com/items' };
useRequestStore.getState().openRequest(saved, { collectionId: 'collection', nodeId: 'node' });
let active = useRequestStore.getState().tabs.find((tab) => tab.id === useRequestStore.getState().activeTabId)!;
assert.equal(isTabDirty(active), false);

useRequestStore.getState().setUrl('https://example.com/items?limit=2');
active = useRequestStore.getState().tabs.find((tab) => tab.id === useRequestStore.getState().activeTabId)!;
assert.equal(isTabDirty(active), true);

useRequestStore.getState().setUrl('https://example.com/items');
active = useRequestStore.getState().tabs.find((tab) => tab.id === useRequestStore.getState().activeTabId)!;
assert.equal(isTabDirty(active), false);

useRequestStore.getState().createRequest();
active = useRequestStore.getState().tabs.find((tab) => tab.id === useRequestStore.getState().activeTabId)!;
assert.equal(isTabDirty(active), true);

console.log('requestStore.test.ts: all assertions passed');
