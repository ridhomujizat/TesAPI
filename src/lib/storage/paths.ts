const join = (root: string, path: string) => `${root.replace(/\/$/, '')}/${path}`;

export const workspacePath = (root: string) => join(root, 'workspace.json');
export const collectionsPath = (root: string) => join(root, 'collections');
export const collectionPath = (root: string, collectionId: string) => join(root, `collections/${collectionId}.json`);
export const legacyCollectionRelativePath = (collectionId: string) => `collections/${collectionId}.json`;
export const collectionDirectory = (collectionId: string) => `collections/${collectionId}`;
export const collectionMetaRelativePath = (collectionId: string) => `${collectionDirectory(collectionId)}/collection.json`;
export const collectionTreeRelativePath = (collectionId: string) => `${collectionDirectory(collectionId)}/tree.json`;
export const collectionRequestsDirectory = (collectionId: string) => `${collectionDirectory(collectionId)}/requests`;
export const collectionRequestRelativePath = (collectionId: string, nodeId: string) => `${collectionRequestsDirectory(collectionId)}/${nodeId}.json`;
export const historyPath = (root: string) => join(root, 'history.ndjson');
export const sessionPath = (root: string) => join(root, 'session.json');
export const environmentsPath = (root: string) => join(root, 'environments.json');
export const environmentsLocalPath = (root: string) => join(root, 'environments.local.json');

export const isSidecarPath = (path: string): boolean =>
  path.endsWith('.base.json') || path.endsWith('.theirs.json') || path.endsWith('/.tesapi-conflict.json') || path === '.tesapi-conflict.json';
