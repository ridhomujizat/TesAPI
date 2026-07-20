import { invoke } from '@tauri-apps/api/core';
import type { EnvironmentSet, EnvironmentsFile } from '../../types';
import { setSetting } from '../registry';
import {
  mergeEnvironmentFiles,
  serializeLocalEnvironments,
  serializeSharedEnvironments,
  type LocalEnvironmentsFile,
  type SharedEnvironmentsFile,
} from './environmentSerialization';
import { WorkspaceFileClient } from './workspaceFileClient';

const SHARED_PATH = 'environments.json';
const LOCAL_PATH = 'environments.local.json';
const REVIEW_PATH = 'secret-review.local.json';

export interface SecretReviewState { affected: string[]; status: 'pending' }

export class EnvironmentFiles {
  constructor(private readonly client: WorkspaceFileClient) {}

  async load(): Promise<EnvironmentsFile> {
    const raw = await this.client.readJson<SharedEnvironmentsFile | EnvironmentsFile>(SHARED_PATH);
    if (!raw) return { schemaVersion: 2, activeEnvironmentId: null, environments: [] };
    this.client.guardSchema(SHARED_PATH, raw.schemaVersion, 2);
    if ('activeEnvironmentId' in raw) return this.migrateLegacy(raw);
    const local = await this.client.readJson<LocalEnvironmentsFile>(LOCAL_PATH)
      ?? { schemaVersion: 1, activeEnvironmentId: null, values: {} };
    this.client.guardSchema(LOCAL_PATH, local.schemaVersion, 1);
    return mergeEnvironmentFiles(raw, local);
  }

  async save(file: EnvironmentsFile): Promise<void> {
    const changed: string[] = [];
    if (await this.client.writeJson(SHARED_PATH, serializeSharedEnvironments(file))) changed.push(SHARED_PATH);
    await this.client.writeJson(LOCAL_PATH, serializeLocalEnvironments(file));
    this.client.scheduleGit(changed);
  }

  async reviewState(): Promise<SecretReviewState | null> {
    return this.client.readJson<SecretReviewState>(REVIEW_PATH);
  }

  async completeReview(choice: 'rotated' | 'purged'): Promise<void> {
    const workspace = this.client.currentWorkspace();
    if (choice === 'purged' && workspace?.syncType === 'git') {
      const sanitized = await invoke<boolean>('git_environment_history_is_sanitized', { rootPath: workspace.rootPath });
      if (!sanitized) throw new Error('Git history still contains environment values. Rotate credentials or finish the purge first.');
    }
    await this.client.deleteFile(REVIEW_PATH);
    if (workspace) await setSetting(`secret_review:${workspace.id}`, choice);
  }

  private async migrateLegacy(file: EnvironmentsFile): Promise<EnvironmentsFile> {
    const migrated: EnvironmentsFile = {
      schemaVersion: 2,
      activeEnvironmentId: file.activeEnvironmentId,
      environments: file.environments.map((environment): EnvironmentSet => ({
        ...environment,
        variables: environment.variables.map((variable) => ({ ...variable, secret: true })),
      })),
    };
    if (this.client.isReadOnly()) return migrated;
    const affected = migrated.environments.flatMap((environment) => environment.variables
      .filter((variable) => variable.value !== '')
      .map((variable) => `${environment.name}: ${variable.key || '(unnamed variable)'}`));
    await this.save(migrated);

    const workspace = this.client.currentWorkspace();
    if (workspace?.syncType === 'git' && affected.length > 0) {
      const tracked = await invoke<boolean>('git_is_workspace_path_tracked', {
        rootPath: workspace.rootPath,
        relativePath: SHARED_PATH,
      });
      if (tracked) {
        await this.client.writeJson(REVIEW_PATH, { status: 'pending', affected } satisfies SecretReviewState);
        await setSetting(`secret_review:${workspace.id}`, 'pending');
      }
    }
    return migrated;
  }
}
