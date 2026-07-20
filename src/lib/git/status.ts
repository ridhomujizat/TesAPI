export type GitEntityStatus = 'added' | 'modified' | 'deleted' | 'conflicted';

export interface GitFileStatus {
  path: string;
  status: Exclude<GitEntityStatus, 'conflicted'>;
}

export interface ChangedEntity {
  id: string;
  label: string;
  path: string;
  status: GitEntityStatus;
  collectionId?: string;
  nodeId?: string;
  structural?: boolean;
}

export const isSidecarPath = (path: string): boolean =>
  path.endsWith('.base.json') || path.endsWith('.theirs.json') || path === '.tesapi-conflict.json' || path.endsWith('/.tesapi-conflict.json');

export function mapGitFileStatus(file: GitFileStatus): ChangedEntity | null {
  if (isSidecarPath(file.path)) return null;
  if (file.path === 'environments.json') return { id: file.path, label: 'Environments', path: file.path, status: file.status };
  const collection = /^collections\/([^/]+)\/(.+)$/.exec(file.path);
  if (!collection) return { id: file.path, label: file.path, path: file.path, status: file.status };
  const [, collectionId, rest] = collection;
  if (rest === 'tree.json') return { id: file.path, label: 'Collection structure', path: file.path, status: file.status, collectionId, structural: true };
  if (rest === 'collection.json') return { id: file.path, label: 'Collection settings', path: file.path, status: file.status, collectionId };
  const request = /^requests\/([^/]+)\.json$/.exec(rest);
  if (request) return { id: file.path, label: request[1], path: file.path, status: file.status, collectionId, nodeId: request[1] };
  return { id: file.path, label: rest, path: file.path, status: file.status, collectionId };
}

export function mapGitFiles(files: GitFileStatus[]): ChangedEntity[] {
  return files.flatMap((file) => { const entity = mapGitFileStatus(file); return entity ? [entity] : []; });
}
