const join = (root: string, path: string) => `${root.replace(/\/$/, '')}/${path}`;

export const workspacePath = (root: string) => join(root, 'workspace.json');
export const collectionsPath = (root: string) => join(root, 'collections');
export const collectionPath = (root: string, collectionId: string) => join(root, `collections/${collectionId}.json`);
export const historyPath = (root: string) => join(root, 'history.ndjson');
export const sessionPath = (root: string) => join(root, 'session.json');
export const environmentsPath = (root: string) => join(root, 'environments.json');
