import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { WorkspaceRecord } from '../types';

export interface GitConflictFile { path: string; kind: string; stages: { base: boolean; ours: boolean; theirs: boolean }; resolved: boolean }
export interface GitConflictManifest { localOid: string; remoteOid: string; baseOid: string; branch: string; files: GitConflictFile[] }

export function useGitConflicts(workspace: WorkspaceRecord | null, onError: (error: unknown) => void) {
  const [manifest, setManifest] = useState<GitConflictManifest | null>(null);
  const refresh = useCallback(async () => {
    if (!workspace || workspace.syncType !== 'git') { setManifest(null); return; }
    setManifest(await invoke<GitConflictManifest | null>('git_workspace_conflicts', { rootPath: workspace.rootPath }));
  }, [workspace?.id, workspace?.rootPath, workspace?.syncType]);

  useEffect(() => {
    void refresh().catch(onError);
    const listener = () => { void refresh().catch(onError); };
    window.addEventListener('tesapi-conflicts-changed', listener);
    return () => window.removeEventListener('tesapi-conflicts-changed', listener);
  }, [onError, refresh]);

  return { manifest, refresh };
}
