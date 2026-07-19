import { useCallback, useEffect, useState } from 'react';
import type { SessionState, WorkspaceRecord } from '../types';
import { createWorkspace, listWorkspaces, openWorkspaceWindow, renameWorkspace, resolveBootWorkspace, type CreateWorkspaceInput } from '../lib/registry';
import { loadWorkspace } from '../lib/workspaces/lifecycle';
import { storageProvider } from '../lib/storage/localJson';
import type { ToastMessage } from '../components/Toast';

export function useWorkspaceController(onToast: (message: ToastMessage) => void) {
  const [current, setCurrent] = useState<WorkspaceRecord | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void resolveBootWorkspace().then(async ({ current: workspace, workspaces: rows }) => {
      const warning = await loadWorkspace(workspace);
      if (cancelled) return;
      setCurrent(workspace);
      setWorkspaces(rows);
      setReady(true);
      if (warning) onToast({ title: 'Workspace opened with a Git warning', detail: warning, tone: 'error' });
    }).catch((error) => {
      if (!cancelled) onToast({ title: 'Workspace unavailable', detail: String(error), tone: 'error' });
    });
    return () => { cancelled = true; };
  }, [onToast]);

  const refresh = useCallback(async () => setWorkspaces(await listWorkspaces()), []);

  const replace = useCallback(async (workspace: WorkspaceRecord, session: SessionState) => {
    if (workspace.id === current?.id) return;
    setReady(false);
    try {
      await storageProvider.saveSession(session);
      const warning = await loadWorkspace(workspace);
      setCurrent(workspace);
      await refresh();
      if (warning) onToast({ title: 'Workspace opened with a Git warning', detail: warning, tone: 'error' });
    } finally {
      setReady(true);
    }
  }, [current?.id, onToast, refresh]);

  const create = useCallback(async (input: CreateWorkspaceInput) => {
    const workspace = await createWorkspace(input);
    await refresh();
    return workspace;
  }, [refresh]);

  const rename = useCallback(async (id: string, name: string) => {
    const updated = await renameWorkspace(id, name);
    setWorkspaces((rows) => rows.map((row) => row.id === id ? updated : row));
    if (current?.id === id) setCurrent(updated);
  }, [current?.id]);

  return { current, workspaces, ready, replace, create, rename, refresh, openNewWindow: openWorkspaceWindow };
}
