import type { Collection, CollectionSummary, EnvironmentsFile, HistoryEntry, HistoryQuery, SessionState, WorkspaceMeta } from '../../types';

export interface StorageProvider {
  initialize(): Promise<WorkspaceMeta>;
  loadWorkspaceMeta(): Promise<WorkspaceMeta>;
  listCollections(): Promise<CollectionSummary[]>;
  loadCollection(id: string): Promise<Collection>;
  saveCollection(collection: Collection): Promise<void>;
  deleteCollection(id: string): Promise<void>;
  appendHistory(entry: HistoryEntry): Promise<void>;
  queryHistory(query: HistoryQuery): Promise<HistoryEntry[]>;
  clearHistory(): Promise<void>;
  loadSession(): Promise<SessionState | null>;
  saveSession(session: SessionState): Promise<void>;
  loadEnvironments(): Promise<EnvironmentsFile>;
  saveEnvironments(environments: EnvironmentsFile): Promise<void>;
}
