import { invoke } from '@tauri-apps/api/core';
import type { WorkspaceRecord } from '../../types';
import { stableStringify } from './serialization';

interface FileSnapshot { contents: string | null; hash: string }
interface WriteOutcome { written: boolean; hash: string }
interface RecoveryResult { quarantinedPath: string; backup?: string }

export class WorkspaceWriteConflict extends Error {
  constructor(public readonly path: string, public readonly retry: () => Promise<void>) {
    super(`Changed on disk: ${path}`);
  }
}

export class WorkspaceFileClient {
  private workspace: WorkspaceRecord | null = null;
  private hashes = new Map<string, string>();
  private pending = new Set<Promise<unknown>>();
  private readOnlyMessage: string | null = null;
  private gitSyncEnabled = false;
  private autoCommitOnSave = false;

  constructor(private readonly onWarning: (message: string) => void = () => undefined) {}

  configure(workspace: WorkspaceRecord): void {
    this.workspace = workspace;
    this.hashes.clear();
    this.readOnlyMessage = null;
    this.gitSyncEnabled = workspace.syncType !== 'git';
    this.autoCommitOnSave = false;
  }

  currentWorkspace(): WorkspaceRecord | null { return this.workspace; }
  rootPath(): string { return this.current().rootPath; }
  isReadOnly(): boolean { return this.readOnlyMessage !== null; }
  readOnlyReason(): string | null { return this.readOnlyMessage; }
  enableGitSync(autoCommitOnSave = true): void { this.gitSyncEnabled = true; this.autoCommitOnSave = autoCommitOnSave; }

  guardSchema(relativePath: string, version: number | undefined, supported: number): void {
    if (version == null || version <= supported || this.readOnlyMessage) return;
    this.readOnlyMessage = `${relativePath} uses schema version ${version}; this TesAPI version supports up to ${supported}. Upgrade TesAPI to edit this workspace.`;
  }

  private current(): WorkspaceRecord {
    if (!this.workspace) throw new Error('Workspace storage is not configured.');
    return this.workspace;
  }

  private track<T>(promise: Promise<T>): Promise<T> {
    this.pending.add(promise);
    void promise.then(
      () => this.pending.delete(promise),
      () => this.pending.delete(promise),
    );
    return promise;
  }

  async readText(relativePath: string): Promise<string | null> {
    const snapshot = await invoke<FileSnapshot>('workspace_read_file', {
      rootPath: this.current().rootPath,
      relativePath,
    });
    this.hashes.set(relativePath, snapshot.hash);
    return snapshot.contents;
  }

  async readJson<T>(relativePath: string): Promise<T | null> {
    const contents = await this.readText(relativePath);
    if (contents == null) return null;
    try {
      return JSON.parse(contents) as T;
    } catch {
      if (this.isReadOnly()) throw new Error(`Workspace is read-only; cannot quarantine corrupt file ${relativePath}.`);
      const recovered = await invoke<RecoveryResult>('quarantine_file', { path: `${this.current().rootPath}/${relativePath}` });
      this.hashes.delete(relativePath);
      if (!recovered.backup) return null;
      const parsed = JSON.parse(recovered.backup) as T;
      await this.writeJson(relativePath, parsed, true);
      return parsed;
    }
  }

  async inspectJson<T>(relativePath: string): Promise<T | null> {
    const contents = await this.readText(relativePath);
    return contents == null ? null : JSON.parse(contents) as T;
  }

  writeJson(relativePath: string, value: unknown, force = false): Promise<boolean> {
    return this.writeText(relativePath, stableStringify(value), force);
  }

  writeText(relativePath: string, contents: string, force = false): Promise<boolean> {
    return this.track(this.writeTextInternal(relativePath, contents, force));
  }

  private async writeTextInternal(relativePath: string, contents: string, force: boolean): Promise<boolean> {
    this.assertWritable();
    const previous = await this.ensureSnapshot(relativePath, force);
    if (previous.contents === contents) return false;
    const write = async (expectedHash: string) => invoke<WriteOutcome>('workspace_write_file', {
      rootPath: this.current().rootPath,
      relativePath,
      contents,
      expectedHash,
    });
    const outcome = await write(previous.hash);
    if (!outcome.written) {
      throw new WorkspaceWriteConflict(relativePath, async () => {
        const current = await this.ensureSnapshot(relativePath, true);
        const retried = await write(current.hash);
        if (!retried.written) throw new Error(`Could not overwrite changed file: ${relativePath}`);
        this.hashes.set(relativePath, retried.hash);
      });
    }
    this.hashes.set(relativePath, outcome.hash);
    return true;
  }

  appendLine(relativePath: string, line: string): Promise<void> {
    this.assertWritable();
    return this.track(invoke<WriteOutcome>('workspace_append_line', {
      rootPath: this.current().rootPath,
      relativePath,
      line,
    }).then((outcome) => { this.hashes.set(relativePath, outcome.hash); }));
  }

  deleteFile(relativePath: string): Promise<boolean> {
    this.assertWritable();
    return this.track(this.deleteFileInternal(relativePath));
  }

  private async deleteFileInternal(relativePath: string): Promise<boolean> {
    const previous = await this.ensureSnapshot(relativePath, false);
    if (previous.contents == null) return false;
    const outcome = await invoke<WriteOutcome>('workspace_delete_file', {
      rootPath: this.current().rootPath,
      relativePath,
      expectedHash: previous.hash,
    });
    if (!outcome.written) throw new WorkspaceWriteConflict(relativePath, () => this.deleteFileInternal(relativePath).then(() => undefined));
    this.hashes.set(relativePath, outcome.hash);
    return true;
  }

  async list(relativePath: string): Promise<string[]> {
    return invoke<string[]>('list_dir', { path: `${this.current().rootPath}/${relativePath}` });
  }

  scheduleGit(paths: string[]): void {
    if (paths.length === 0 || this.current().syncType !== 'git') return;
    window.dispatchEvent(new CustomEvent('tesapi-workspace-saved', { detail: { paths } }));
    if (this.isReadOnly() || !this.gitSyncEnabled || !this.autoCommitOnSave) return;
    const promise = invoke<boolean>('git_commit_workspace_paths', {
      rootPath: this.current().rootPath,
      relativePaths: [...new Set(paths)],
    });
    this.track(promise).catch((error) => this.onWarning(`Saved locally, but Git sync failed: ${String(error)}`));
  }

  async flush(): Promise<void> {
    const queueFlush = invoke('workspace_flush', { rootPath: this.current().rootPath });
    await Promise.all([Promise.allSettled([...this.pending]), queueFlush]);
  }

  clearHash(relativePath: string): void { this.hashes.delete(relativePath); }

  async externalChanges(paths: string[]): Promise<string[]> {
    const changed: string[] = [];
    for (const relativePath of paths) {
      const snapshot = await invoke<FileSnapshot>('workspace_read_file', {
        rootPath: this.current().rootPath,
        relativePath,
      });
      if (this.hashes.get(relativePath) !== snapshot.hash) changed.push(relativePath);
    }
    return changed;
  }

  async acceptExternal(relativePath: string): Promise<void> {
    await this.readText(relativePath);
  }

  private async ensureSnapshot(relativePath: string, refresh: boolean): Promise<FileSnapshot> {
    if (!refresh && this.hashes.has(relativePath)) {
      const contents = await invoke<FileSnapshot>('workspace_read_file', {
        rootPath: this.current().rootPath,
        relativePath,
      });
      // Preserve the original hash for compare-and-swap while still avoiding redundant writes.
      return { contents: contents.contents, hash: this.hashes.get(relativePath)! };
    }
    const snapshot = await invoke<FileSnapshot>('workspace_read_file', {
      rootPath: this.current().rootPath,
      relativePath,
    });
    this.hashes.set(relativePath, snapshot.hash);
    return snapshot;
  }

  private assertWritable(): void {
    if (this.readOnlyMessage) throw new Error(`Workspace is read-only. ${this.readOnlyMessage}`);
  }
}
