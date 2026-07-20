import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import type { StorageConflict, WorkspaceRecord } from '../types';
import { storageProvider } from '../lib/storage/localJson';
import { hasDirtyOwner, keepDirtyRequest, reloadWorkspacePath } from '../lib/workspaces/externalChanges';

interface WorkspaceFilesChanged { paths: string[] }

export function useWorkspaceWatcher(workspace: WorkspaceRecord | null, onConflict: (conflict: StorageConflict) => void, onError: (error: unknown) => void): void {
  useEffect(() => {
    if (!workspace) return;
    let disposed = false;
    let stop: (() => void) | undefined;
    void listen<WorkspaceFilesChanged>('workspace-files-changed', (event) => {
      void storageProvider.externalChanges(event.payload.paths).then(async (paths) => {
        for (const path of paths) {
          if (hasDirtyOwner(path)) {
            onConflict({
              path,
              detail: 'A teammate or Git changed this request while your draft is still open.',
              keepMine: () => keepDirtyRequest(path),
            });
          } else {
            await reloadWorkspacePath(path, false);
          }
        }
      }).catch(onError);
    }).then((unlisten) => {
      if (disposed) unlisten(); else stop = unlisten;
    }).catch(onError);
    void invoke('watch_workspace', { rootPath: workspace.rootPath }).catch(onError);
    return () => { disposed = true; stop?.(); };
  }, [onConflict, onError, workspace?.id, workspace?.rootPath]);
}
