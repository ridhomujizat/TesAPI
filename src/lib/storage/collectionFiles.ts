import { invoke } from '@tauri-apps/api/core';
import type { Collection, CollectionSummary, TesApiRequest, TreeNode, WorkspaceRecord } from '../../types';
import { countNodes } from '../collections';
import {
  collectionMetaRelativePath,
  collectionRequestRelativePath,
  collectionRequestsDirectory,
  collectionTreeRelativePath,
  isSidecarPath,
  legacyCollectionRelativePath,
} from './paths';
import { stableStringify } from './serialization';
import { WorkspaceFileClient } from './workspaceFileClient';

const COLLECTION_SCHEMA = 2;

interface CollectionMetaFile { schemaVersion: number; id: string; name: string }
type CollectionTreeNode =
  | { id: string; type: 'folder'; name: string; children: CollectionTreeNode[] }
  | { id: string; type: 'request'; name: string };
interface CollectionTreeFile { schemaVersion: number; root: CollectionTreeNode[] }
interface RequestFile { schemaVersion: number; id: string; name: string; request: TesApiRequest }

function splitTree(nodes: TreeNode[], requests: RequestFile[]): CollectionTreeNode[] {
  return nodes.map((node) => {
    if (node.type === 'folder') return { id: node.id, type: 'folder', name: node.name, children: splitTree(node.children, requests) };
    requests.push({ schemaVersion: COLLECTION_SCHEMA, id: node.id, name: node.name, request: node.request });
    return { id: node.id, type: 'request', name: node.name };
  });
}

function requestIds(nodes: CollectionTreeNode[]): string[] {
  return nodes.flatMap((node) => node.type === 'request' ? [node.id] : requestIds(node.children));
}

async function assembleTree(nodes: CollectionTreeNode[], collectionId: string, client: WorkspaceFileClient): Promise<TreeNode[]> {
  return Promise.all(nodes.map(async (node) => {
    if (node.type === 'folder') return { ...node, children: await assembleTree(node.children, collectionId, client) };
    const file = await client.readJson<RequestFile>(collectionRequestRelativePath(collectionId, node.id));
    if (!file) throw new Error(`Request file is missing: ${node.id}`);
    client.guardSchema(collectionRequestRelativePath(collectionId, node.id), file.schemaVersion, COLLECTION_SCHEMA);
    return { id: node.id, type: 'request' as const, name: file.name || node.name, request: file.request };
  }));
}

export class CollectionFiles {
  constructor(private readonly client: WorkspaceFileClient) {}

  async list(): Promise<CollectionSummary[]> {
    const entries = await this.client.list('collections');
    for (const entry of entries.filter((name) => name.endsWith('.json') && !isSidecarPath(name))) {
      await this.migrateLegacy(entry.slice(0, -5));
    }
    const ids = (await this.client.list('collections')).filter((name) => !name.endsWith('.json'));
    const summaries = await Promise.all(ids.map(async (id) => {
      const meta = await this.client.readJson<CollectionMetaFile>(collectionMetaRelativePath(id));
      const tree = await this.client.readJson<CollectionTreeFile>(collectionTreeRelativePath(id));
      if (!meta || !tree) return null;
      this.client.guardSchema(collectionMetaRelativePath(id), meta.schemaVersion, COLLECTION_SCHEMA);
      this.client.guardSchema(collectionTreeRelativePath(id), tree.schemaVersion, COLLECTION_SCHEMA);
      const counts = countNodes({ id, name: meta.name, schemaVersion: COLLECTION_SCHEMA, root: await assembleTree(tree.root, id, this.client) });
      return { id, name: meta.name, ...counts };
    }));
    return summaries.filter((value): value is CollectionSummary => value !== null).sort((a, b) => a.name.localeCompare(b.name));
  }

  async load(id: string): Promise<Collection> {
    let meta = await this.client.readJson<CollectionMetaFile>(collectionMetaRelativePath(id));
    if (!meta && await this.client.readJson<Collection>(legacyCollectionRelativePath(id))) {
      await this.migrateLegacy(id);
      meta = await this.client.readJson<CollectionMetaFile>(collectionMetaRelativePath(id));
    }
    const tree = await this.client.readJson<CollectionTreeFile>(collectionTreeRelativePath(id));
    if (!meta || !tree) throw new Error(`Collection not found: ${id}`);
    this.client.guardSchema(collectionMetaRelativePath(id), meta.schemaVersion, COLLECTION_SCHEMA);
    this.client.guardSchema(collectionTreeRelativePath(id), tree.schemaVersion, COLLECTION_SCHEMA);
    return { id: meta.id, name: meta.name, schemaVersion: COLLECTION_SCHEMA, root: await assembleTree(tree.root, id, this.client) };
  }

  async save(collection: Collection): Promise<void> {
    const changed = await this.persist(collection);
    this.client.scheduleGit(changed);
  }

  async delete(id: string): Promise<void> {
    const changed: string[] = [];
    const requestFiles = await this.client.list(collectionRequestsDirectory(id));
    for (const file of requestFiles.filter((name) => name.endsWith('.json') && !isSidecarPath(name))) {
      const path = `${collectionRequestsDirectory(id)}/${file}`;
      if (await this.client.deleteFile(path)) changed.push(path);
    }
    for (const path of [collectionTreeRelativePath(id), collectionMetaRelativePath(id), legacyCollectionRelativePath(id)]) {
      if (await this.client.deleteFile(path)) changed.push(path);
    }
    this.client.scheduleGit(changed);
  }

  private async persist(collection: Collection): Promise<string[]> {
    const requests: RequestFile[] = [];
    const tree: CollectionTreeFile = { schemaVersion: COLLECTION_SCHEMA, root: splitTree(collection.root, requests) };
    const meta: CollectionMetaFile = { schemaVersion: COLLECTION_SCHEMA, id: collection.id, name: collection.name };
    const changed: string[] = [];
    const write = async (path: string, value: unknown) => { if (await this.client.writeJson(path, value)) changed.push(path); };
    await write(collectionMetaRelativePath(collection.id), meta);
    await write(collectionTreeRelativePath(collection.id), tree);
    for (const request of requests) await write(collectionRequestRelativePath(collection.id, request.id), request);

    const expected = new Set(requestIds(tree.root).map((id) => `${id}.json`));
    const existing = await this.client.list(collectionRequestsDirectory(collection.id));
    for (const file of existing.filter((name) => name.endsWith('.json') && !isSidecarPath(name) && !expected.has(name))) {
      const path = `${collectionRequestsDirectory(collection.id)}/${file}`;
      if (await this.client.deleteFile(path)) changed.push(path);
    }
    return changed;
  }

  private async migrateLegacy(id: string): Promise<void> {
    const legacyPath = legacyCollectionRelativePath(id);
    const collection = await this.client.readJson<Collection>(legacyPath);
    if (!collection) return;
    this.client.guardSchema(legacyPath, collection.schemaVersion, 1);
    if (this.client.isReadOnly()) return;
    const workspace = this.client.currentWorkspace() as WorkspaceRecord;
    await invoke('atomic_write_json', {
      path: `backups/${workspace.id}/${id}.json`,
      contents: stableStringify(collection),
    });
    const changed = await this.persist({ ...collection, schemaVersion: COLLECTION_SCHEMA });
    if (await this.client.deleteFile(legacyPath)) changed.push(legacyPath);
    this.client.scheduleGit(changed);
  }
}
