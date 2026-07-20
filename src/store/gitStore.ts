import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { WorkspaceRecord } from '../types';
import { mapGitFiles } from '../lib/git/status';
import type { GitBranch, GitFileSource, GitLogEntry, GitStoreState, GitWorkspaceStatus } from '../lib/git/types';

interface State extends GitStoreState {
  workspaceId: string | null;
  rootPath: string | null;
  configure: (workspace: WorkspaceRecord | null) => void;
  refresh: () => Promise<void>;
  loadHistory: () => Promise<void>;
  loadBranches: () => Promise<void>;
  loadRemote: () => Promise<void>;
  source: (path: string) => Promise<GitFileSource>;
  commit: (paths: string[], message: string) => Promise<boolean>;
  push: () => Promise<void>;
  pull: (branch: string) => Promise<unknown>;
  checkout: (branch: string) => Promise<void>;
  createBranch: (branch: string) => Promise<void>;
  renameBranch: (branch: string, next: string) => Promise<void>;
  deleteBranch: (branch: string) => Promise<void>;
  discard: (paths: string[]) => Promise<void>;
  reset: () => Promise<void>;
  setRemote: (url: string) => Promise<void>;
  testRemote: (url?: string) => Promise<void>;
}

const initial: GitStoreState = { status: null, entities: [], branches: [], history: [], remote: null, inFlight: null, error: null };

export const useGitStore = create<State>((set, get) => {
  const run = async <T,>(name: string, command: string, args: Record<string, unknown> = {}): Promise<T> => {
    const rootPath = get().rootPath;
    if (!rootPath) throw new Error('Git workspace is not active');
    set({ inFlight: name, error: null });
    try { return await invoke<T>(command, { rootPath, ...args }); }
    catch (error) { const message = String(error).replace(/^Error:\s*/, ''); set({ error: message }); throw error; }
    finally { set({ inFlight: null }); }
  };
  return {
    ...initial, workspaceId: null, rootPath: null,
    configure: (workspace) => set(workspace?.syncType === 'git' ? { workspaceId: workspace.id, rootPath: workspace.rootPath, ...initial } : { workspaceId: workspace?.id ?? null, rootPath: null, ...initial }),
    refresh: async () => {
      const rootPath = get().rootPath; if (!rootPath) return;
      const status = await run<GitWorkspaceStatus>('status', 'git_workspace_status');
      const manifest = await invoke<{ files: Array<{ path: string }> } | null>('git_workspace_conflicts', { rootPath }).catch(() => null);
      const entities = mapGitFiles(status.files);
      for (const file of manifest?.files ?? []) {
        const existing = entities.find((entity) => entity.path === file.path);
        if (existing) existing.status = 'conflicted';
        else {
          const mapped = mapGitFiles([{ path: file.path, status: 'modified' }]);
          if (mapped[0]) entities.push({ ...mapped[0], status: 'conflicted' });
        }
      }
      set({ status, entities });
    },
    loadHistory: async () => set({ history: await run<GitLogEntry[]>('history', 'git_workspace_log', { limit: 50 }) }),
    loadBranches: async () => set({ branches: await run<GitBranch[]>('branches', 'git_workspace_branches') }),
    loadRemote: async () => set({ remote: await run<string | null>('remote', 'git_workspace_remote') }),
    source: (path) => run<GitFileSource>('source', 'git_read_workspace_source', { relativePath: path }),
    commit: async (paths, message) => { const result = await run<boolean>('commit', 'git_commit_workspace_selection', { relativePaths: paths, message }); await get().refresh(); return result; },
    push: async () => { await run<void>('push', 'git_push_workspace'); await get().refresh(); },
    pull: async (branch) => { const result = await run<unknown>('pull', 'git_pull_workspace', { branch }); await get().refresh(); return result; },
    checkout: async (branch) => { await run<void>('checkout', 'git_checkout_workspace_branch', { branch }); await get().refresh(); await get().loadBranches(); },
    createBranch: async (branch) => { await run<void>('create-branch', 'git_create_workspace_branch', { branch }); await get().refresh(); await get().loadBranches(); },
    renameBranch: async (branch, next) => { await run<void>('rename-branch', 'git_rename_workspace_branch', { branch, nextBranch: next }); await get().refresh(); await get().loadBranches(); },
    deleteBranch: async (branch) => { await run<void>('delete-branch', 'git_delete_workspace_branch', { branch }); await get().loadBranches(); },
    discard: async (paths) => { await run<void>('discard', 'git_discard_workspace_paths', { relativePaths: paths }); await get().refresh(); },
    reset: async () => { await run<void>('reset', 'git_reset_workspace_hard'); await get().refresh(); },
    setRemote: async (url) => { await run<void>('set-remote', 'git_set_workspace_remote', { url }); await get().loadRemote(); await get().refresh(); },
    testRemote: (url) => run<void>('test-remote', 'git_test_workspace_remote', { url }),
  };
});
