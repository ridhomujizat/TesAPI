import type { CollectionSummary, SavedResponse } from '../../../types';
import type { FlatNode } from '../../../lib/collections';

type RequestNode = Extract<FlatNode, { type: 'request' }>;

export type CollectionRow =
  | { key: string; type: 'collection'; collection: CollectionSummary; depth: number }
  | { key: string; type: 'folder' | 'request'; collectionId: string; node: FlatNode; depth: number }
  | { key: string; type: 'response'; collectionId: string; node: RequestNode; response: SavedResponse; depth: number };
export type DropMode = 'before' | 'inside' | 'after';
export interface ContextState { x: number; y: number; collectionId: string; nodeId?: string; responseId?: string; type: 'empty' | 'collection' | 'folder' | 'request' | 'response' }
export interface MoveState { sourceCollectionId: string; nodeId: string; location: string }
export interface EditingState { collectionId: string; nodeId?: string; value: string }
export interface DeleteState { collectionId: string; nodeId?: string; responseId?: string; name: string; type: 'collection' | 'folder' | 'request' | 'response' }
export interface DragState { collectionId: string; nodeId: string }
export interface DropState { key: string; mode: DropMode }
export interface MoveLocation { value: string; label: string; collectionId: string; parentId: string | null }

interface CollectionState {
  summaries: CollectionSummary[];
  collectionsById: Record<string, { nodesById: Record<string, FlatNode>; childIdsByParent: Record<string, string[]> }>;
  expandedIds: Record<string, boolean>;
}

export function buildRows(state: CollectionState, query: string): CollectionRow[] {
  const result: CollectionRow[] = [];
  const search = query.trim().toLowerCase();
  if (search) {
    for (const summary of state.summaries) {
      for (const node of Object.values(state.collectionsById[summary.id]?.nodesById ?? {})) {
        if (node.type === 'request' && (node.name.toLowerCase().includes(search) || node.request.url.toLowerCase().includes(search))) result.push({ key: `${summary.id}:${node.id}`, type: 'request', collectionId: summary.id, node, depth: 0 });
      }
    }
    return result;
  }
  const visit = (collectionId: string, nodeId: string, depth: number) => {
    const collection = state.collectionsById[collectionId];
    const node = collection?.nodesById[nodeId];
    if (!node) return;
    result.push({ key: `${collectionId}:${node.id}`, type: node.type, collectionId, node, depth });
    if (node.type === 'folder' && state.expandedIds[node.id]) for (const child of collection.childIdsByParent[node.id] ?? []) visit(collectionId, child, depth + 1);
    if (node.type === 'request' && state.expandedIds[node.id]) {
      for (const response of node.savedResponses ?? []) result.push({ key: `${collectionId}:${node.id}:${response.id}`, type: 'response', collectionId, node, response, depth: depth + 1 });
    }
  };
  for (const summary of state.summaries) {
    result.push({ key: summary.id, type: 'collection', collection: summary, depth: 0 });
    if (!state.expandedIds[summary.id]) continue;
    const collection = state.collectionsById[summary.id];
    for (const id of collection?.childIdsByParent.__root__ ?? []) visit(summary.id, id, 1);
  }
  return result;
}

export function buildMoveLocations(state: CollectionState, move: MoveState, isDescendant: (nodes: Record<string, FlatNode>, sourceId: string, targetId: string) => boolean): MoveLocation[] {
  const result: MoveLocation[] = [];
  const sourceCollection = state.collectionsById[move.sourceCollectionId];
  const sourceNode = sourceCollection?.nodesById[move.nodeId];
  const visit = (collectionId: string, nodeId: string, depth: number) => {
    const collection = state.collectionsById[collectionId];
    const node = collection?.nodesById[nodeId];
    if (!node || node.type !== 'folder') return;
    if (sourceNode?.type === 'folder' && collectionId === move.sourceCollectionId && sourceCollection && isDescendant(sourceCollection.nodesById, sourceNode.id, node.id)) return;
    result.push({ value: `${collectionId}|${node.id}`, label: `${'  '.repeat(depth)}${node.name}`, collectionId, parentId: node.id });
    for (const childId of collection.childIdsByParent[node.id] ?? []) visit(collectionId, childId, depth + 1);
  };
  for (const summary of state.summaries) {
    result.push({ value: `${summary.id}|`, label: summary.name, collectionId: summary.id, parentId: null });
    for (const nodeId of state.collectionsById[summary.id]?.childIdsByParent.__root__ ?? []) visit(summary.id, nodeId, 1);
  }
  return result;
}
