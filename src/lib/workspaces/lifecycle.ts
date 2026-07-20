import { invoke } from '@tauri-apps/api/core';
import type { SessionState, WorkspaceRecord } from '../../types';
import { useCollectionStore } from '../../store/collectionStore';
import { useEnvironmentStore } from '../../store/environmentStore';
import { useRequestStore } from '../../store/requestStore';
import { getSetting, registerWorkspaceWindow, setSetting, setWorkspaceWindowTitle, touchLastOpened } from '../registry';
import { storageProvider } from '../storage/localJson';

export type WorkspaceSyncState = 'idle' | 'synced' | 'paused' | 'conflicted';
interface GitSyncResult { state: WorkspaceSyncState }
export interface WorkspaceLoadResult { warning: string | null; syncState: WorkspaceSyncState }

export function currentSession(): SessionState {
  const request = useRequestStore.getState();
  const collections = useCollectionStore.getState();
  return {
    schemaVersion: 1,
    activeTabId: request.activeTabId,
    tabs: request.tabs,
    expandedIds: Object.entries(collections.expandedIds).filter(([, expanded]) => expanded).map(([id]) => id),
  };
}

export async function saveCurrentSession(): Promise<void> {
  if (storageProvider.currentWorkspace() && !storageProvider.isReadOnly()) await storageProvider.saveSession(currentSession());
}

export function resetWorkspaceStores(): void {
  useRequestStore.getState().reset();
  useCollectionStore.getState().reset();
  useEnvironmentStore.getState().reset();
}

export async function loadWorkspace(workspace: WorkspaceRecord): Promise<WorkspaceLoadResult> {
  if (storageProvider.currentWorkspace()) await storageProvider.flush();
  resetWorkspaceStores();
  storageProvider.configure(workspace);
  await storageProvider.inspectCompatibility();
  let warning: string | null = null;
  let syncState: WorkspaceSyncState = 'idle';
  const identity = workspace.syncType === 'git'
    ? await getSetting<{ name: string; email: string }>('git_identity')
    : null;
  if (workspace.syncType === 'git' && identity && !storageProvider.isReadOnly()) {
    await invoke('git_set_identity', { rootPath: workspace.rootPath, name: identity.name, email: identity.email });
    storageProvider.enableGitSync();
  }
  if (workspace.syncType === 'git' && identity && !storageProvider.isReadOnly()) {
    try {
      const result = await invoke<GitSyncResult>('git_pull_workspace', { rootPath: workspace.rootPath, branch: workspace.gitBranch ?? 'main' });
      syncState = result.state;
    } catch (error) {
      warning = String(error);
    }
  }
  await useCollectionStore.getState().initialize();
  await useEnvironmentStore.getState().initialize();
  const session = await storageProvider.loadSession();
  if (session) {
    useRequestStore.getState().restoreSession(session);
    for (const id of session.expandedIds ?? []) useCollectionStore.getState().setExpanded(id, true);
  }
  await Promise.all([
    touchLastOpened(workspace.id),
    setSetting('last_workspace_id', workspace.id),
    registerWorkspaceWindow(workspace.id),
    setWorkspaceWindowTitle(workspace.name),
  ]);
  return { warning, syncState };
}
