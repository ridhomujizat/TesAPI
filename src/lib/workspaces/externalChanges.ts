import { isTabDirty } from '../collections';
import { storageProvider } from '../storage/localJson';
import { isSidecarPath } from '../storage/paths';
import { useCollectionStore } from '../../store/collectionStore';
import { useEnvironmentStore } from '../../store/environmentStore';
import { useRequestStore } from '../../store/requestStore';

const collectionIdFromPath = (path: string): string | null => {
  const match = /^collections\/([^/]+)\//.exec(path);
  return match?.[1] ?? null;
};

const requestIdFromPath = (path: string): string | null => {
  const match = /^collections\/[^/]+\/requests\/([^/]+)\.json$/.exec(path);
  return match?.[1] ?? null;
};

export async function reloadWorkspacePath(path: string, overwriteDirty: boolean): Promise<void> {
  if (isSidecarPath(path)) {
    window.dispatchEvent(new Event('tesapi-conflicts-changed'));
    return;
  }
  await storageProvider.acceptExternal(path);
  if (path === 'environments.json') {
    await useEnvironmentStore.getState().reload();
    return;
  }
  const collectionId = collectionIdFromPath(path);
  if (!collectionId) return;
  await useCollectionStore.getState().reloadCollection(collectionId);
  const collection = useCollectionStore.getState().collectionsById[collectionId];
  if (!collection) return;
  for (const node of Object.values(collection.nodesById)) {
    if (node.type !== 'request') continue;
    const origin = { collectionId, nodeId: node.id };
    const store = useRequestStore.getState();
    if (overwriteDirty) store.reloadSavedRequest(origin, node.request, node.name);
    else store.refreshSavedRequest(origin, node.request, node.name);
  }
}

export function hasDirtyOwner(path: string): boolean {
  const collectionId = collectionIdFromPath(path);
  const requestId = requestIdFromPath(path);
  if (!collectionId) return false;
  return useRequestStore.getState().tabs.some((tab) =>
    tab.origin?.collectionId === collectionId
    && (!requestId || tab.origin.nodeId === requestId)
    && isTabDirty(tab));
}

export async function keepDirtyRequest(path: string): Promise<void> {
  const collectionId = collectionIdFromPath(path);
  const requestId = requestIdFromPath(path);
  if (!collectionId || !requestId) return;
  await storageProvider.acceptExternal(path);
  const tab = useRequestStore.getState().tabs.find((item) => item.origin?.collectionId === collectionId && item.origin.nodeId === requestId);
  if (!tab) return;
  await useCollectionStore.getState().reloadCollection(collectionId);
  const collection = useCollectionStore.getState().collectionsById[collectionId];
  const node = collection?.nodesById[requestId];
  if (!node || node.type !== 'request') return;
  await useCollectionStore.getState().saveRequest(collectionId, node.parentId, tab.draft.name || node.name, tab.draft, requestId);
}
