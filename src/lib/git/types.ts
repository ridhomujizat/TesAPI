import type { ChangedEntity, GitEntityStatus } from './status';

export interface GitWorkspaceStatus {
  branch: string;
  ahead: number;
  behind: number;
  hasRemote: boolean;
  files: Array<{ path: string; status: Exclude<GitEntityStatus, 'conflicted'> }>;
}

export interface GitBranch { name: string; current: boolean }
export interface GitLogEntry { oid: string; message: string; author: string; email: string; timestamp: number; paths: string[] }
export interface GitFileSource { before: string | null; after: string | null }
export interface GitStoreState {
  status: GitWorkspaceStatus | null;
  entities: ChangedEntity[];
  branches: GitBranch[];
  history: GitLogEntry[];
  remote: string | null;
  inFlight: string | null;
  error: string | null;
}
