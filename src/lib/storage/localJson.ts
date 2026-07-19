import { invoke } from '@tauri-apps/api/core';
import type { Collection, CollectionSummary, EnvironmentsFile, HistoryEntry, HistoryQuery, SessionState, WorkspaceMeta, WorkspaceRecord } from '../../types';
import { countNodes } from '../collections';
import { migrate } from './migrate';
import { collectionPath, collectionsPath, environmentsPath, historyPath, sessionPath, workspacePath } from './paths';
import type { StorageProvider } from './provider';

const HISTORY_LIMIT = 1000;
const warningListeners = new Set<(message: string) => void>();

export const onStorageWarning = (listener: (message: string) => void) => {
  warningListeners.add(listener);
  return () => { warningListeners.delete(listener); };
};

const warn = (message: string) => warningListeners.forEach((listener) => listener(message));

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map((key) => [key, stable((value as Record<string, unknown>)[key])]));
}

export const stableStringify = (value: unknown) => `${JSON.stringify(stable(value), null, 2)}\n`;

interface RecoveryResult { quarantinedPath: string; backup?: string }
interface CollectionSummaryRecord { fileName: string; summary: CollectionSummary | null }

export class LocalJsonProvider implements StorageProvider {
  private workspace: WorkspaceRecord | null = null;

  configure(workspace: WorkspaceRecord): void { this.workspace = workspace; }
  currentWorkspace(): WorkspaceRecord | null { return this.workspace; }

  private root(): string {
    if (!this.workspace) throw new Error('Workspace storage is not configured.');
    return this.workspace.rootPath;
  }

  private async read<T>(path: string): Promise<T | null> {
    const contents = await invoke<string | null>('read_json', { path });
    if (contents == null) return null;
    try {
      return JSON.parse(contents) as T;
    } catch {
      const recovered = await invoke<RecoveryResult>('quarantine_file', { path });
      warn(`Recovered corrupt storage file: ${path}`);
      if (!recovered.backup) return null;
      const parsed = JSON.parse(recovered.backup) as T;
      await invoke('atomic_write_json', { path, contents: stableStringify(parsed) });
      return parsed;
    }
  }

  private async write(path: string, value: unknown, gitRelativePath?: string): Promise<void> {
    await invoke('atomic_write_json', { path, contents: stableStringify(value) });
    if (gitRelativePath && this.workspace?.syncType === 'git') {
      void invoke<boolean>('git_commit_workspace_file', { rootPath: this.root(), relativePath: gitRelativePath })
        .catch((error) => warn(`Saved locally, but Git sync failed: ${String(error)}`));
    }
  }

  async initialize(): Promise<WorkspaceMeta> {
    const workspace = this.workspace;
    if (!workspace) throw new Error('Workspace storage is not configured.');
    await invoke('ensure_dirs', { paths: [workspace.rootPath, collectionsPath(workspace.rootPath)] });
    if (!await this.read(workspacePath(workspace.rootPath))) {
      await this.write(workspacePath(workspace.rootPath), { schemaVersion: 1, id: workspace.id, name: workspace.name, syncType: workspace.syncType, gitRemote: workspace.gitRemote, gitBranch: workspace.gitBranch });
    }
    if (!await this.read<EnvironmentsFile>(environmentsPath(workspace.rootPath))) {
      await this.write(environmentsPath(workspace.rootPath), { schemaVersion: 1, activeEnvironmentId: null, environments: [] });
    }
    return this.loadWorkspaceMeta();
  }

  async loadWorkspaceMeta(): Promise<WorkspaceMeta> {
    const workspace = this.workspace;
    if (!workspace) throw new Error('Workspace storage is not configured.');
    return { schemaVersion: 1, activeWorkspaceId: workspace.id, workspaces: [{ id: workspace.id, name: workspace.name, storage: { type: workspace.syncType, rootPath: workspace.rootPath, git: { enabled: workspace.syncType === 'git' } } }] };
  }

  async listCollections(): Promise<CollectionSummary[]> {
    const root = this.root();
    const records = await invoke<CollectionSummaryRecord[]>('list_collection_summaries', { path: collectionsPath(root) });
    const summaries: CollectionSummary[] = [];
    for (const record of records) {
      if (record.summary) { summaries.push(record.summary); continue; }
      const collection = await this.read<Collection>(`${collectionsPath(root)}/${record.fileName}`);
      if (collection) summaries.push({ id: collection.id, name: collection.name, ...countNodes(collection) });
    }
    return summaries.sort((a, b) => a.name.localeCompare(b.name));
  }

  async loadCollection(id: string): Promise<Collection> {
    const collection = await this.read<Collection>(collectionPath(this.root(), id));
    if (!collection) throw new Error(`Collection not found: ${id}`);
    return migrate(collection);
  }

  async saveCollection(collection: Collection): Promise<void> {
    await this.write(collectionPath(this.root(), collection.id), migrate(collection), `collections/${collection.id}.json`);
  }

  async deleteCollection(id: string): Promise<void> {
    await invoke('delete_file', { path: collectionPath(this.root(), id) });
    if (this.workspace?.syncType === 'git') {
      void invoke<boolean>('git_commit_workspace_file', { rootPath: this.root(), relativePath: `collections/${id}.json` })
        .catch((error) => warn(`Deleted locally, but Git sync failed: ${String(error)}`));
    }
  }

  async appendHistory(entry: HistoryEntry): Promise<void> {
    const path = historyPath(this.root());
    await invoke('append_line', { path, line: JSON.stringify(entry) });
    const lines = await invoke<string[]>('read_last_lines', { path, count: HISTORY_LIMIT + 1 });
    if (lines.length > HISTORY_LIMIT) await invoke('atomic_write_json', { path, contents: `${lines.slice(-HISTORY_LIMIT).join('\n')}\n` });
  }

  async queryHistory(query: HistoryQuery): Promise<HistoryEntry[]> {
    const lines = await invoke<string[]>('read_last_lines', { path: historyPath(this.root()), count: query.limit ?? HISTORY_LIMIT });
    const search = query.search?.toLowerCase() ?? '';
    return lines.reverse().flatMap((line) => { try { return [JSON.parse(line) as HistoryEntry]; } catch { return []; } }).filter((entry) => {
      if (search && !entry.url.toLowerCase().includes(search)) return false;
      if (query.method && query.method !== 'ALL' && entry.method !== query.method) return false;
      if (query.statusClass && query.statusClass !== 'ALL') return query.statusClass === 'error' ? entry.status === 0 : Math.floor(entry.status / 100) === Number(query.statusClass[0]);
      return true;
    });
  }

  async clearHistory(): Promise<void> {
    const path = historyPath(this.root());
    await Promise.all([invoke('delete_file', { path }), invoke('delete_file', { path: `${path}.bak` })]);
  }

  async loadSession(): Promise<SessionState | null> { return this.read<SessionState>(sessionPath(this.root())); }
  async saveSession(session: SessionState): Promise<void> { await this.write(sessionPath(this.root()), session); }

  async loadEnvironments(): Promise<EnvironmentsFile> {
    return migrate(await this.read<EnvironmentsFile>(environmentsPath(this.root())) ?? { schemaVersion: 1, activeEnvironmentId: null, environments: [] });
  }

  async saveEnvironments(environments: EnvironmentsFile): Promise<void> {
    await this.write(environmentsPath(this.root()), migrate(environments), 'environments.json');
  }
}

export const storageProvider = new LocalJsonProvider();
