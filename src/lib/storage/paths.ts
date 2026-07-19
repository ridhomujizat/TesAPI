export const registryPath = 'workspaces.json';
export const workspaceRoot = (workspaceId: string) => `workspaces/${workspaceId}`;
export const workspacePath = (workspaceId: string) => `${workspaceRoot(workspaceId)}/workspace.json`;
export const collectionsPath = (workspaceId: string) => `${workspaceRoot(workspaceId)}/collections`;
export const collectionPath = (workspaceId: string, collectionId: string) => `${collectionsPath(workspaceId)}/${collectionId}.json`;
export const historyPath = (workspaceId: string) => `${workspaceRoot(workspaceId)}/history.ndjson`;
export const sessionPath = (workspaceId: string) => `${workspaceRoot(workspaceId)}/session.json`;
export const environmentsPath = (workspaceId: string) => `${workspaceRoot(workspaceId)}/environments.json`;
