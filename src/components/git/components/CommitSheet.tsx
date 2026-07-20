import { useEffect, useMemo, useState } from 'react';
import { GitBranch, X } from 'lucide-react';
import type { WorkspaceRecord } from '../../../types';
import type { ToastMessage } from '../../Toast';
import { useCollectionStore } from '../../../store/collectionStore';
import { useGitStore } from '../../../store/gitStore';
import { storageProvider } from '../../../lib/storage/localJson';
import { rehydrateWorkspaceStores } from '../../../lib/workspaces/lifecycle';
import type { GitFileSource } from '../../../lib/git/types';
import { ChangesTree, type CommitEntity } from './ChangesTree';
import { DiffPanel } from './DiffPanel';
import { canCommitSelection, toggleSelection } from '../../../lib/git/selection';
import { invoke } from '@tauri-apps/api/core';

function enrichEntities(): CommitEntity[] {
  const { entities } = useGitStore.getState(); const collections = useCollectionStore.getState();
  return entities.map((entity) => {
    const collection = entity.collectionId ? collections.collectionsById[entity.collectionId] : null;
    const node = entity.nodeId ? collection?.nodesById[entity.nodeId] : null;
    const ancestors: string[] = [];
    let parentId = node?.parentId ?? null;
    while (parentId && collection) { const parent = collection.nodesById[parentId]; if (!parent) break; ancestors.unshift(parent.name); parentId = parent.parentId; }
    return { ...entity, label: node?.name ?? entity.label, collectionName: collection?.name ?? collections.summaries.find((item) => item.id === entity.collectionId)?.name ?? (entity.collectionId ? 'Collection' : 'Workspace'), ancestors };
  });
}

export function CommitSheet({ workspace, onClose, onToast }: { workspace: WorkspaceRecord; onClose: () => void; onToast: (message: ToastMessage) => void }) {
  const git = useGitStore(); const [checked, setChecked] = useState<Set<string>>(new Set()); const [selected, setSelected] = useState<string | null>(null); const [message, setMessage] = useState(''); const [source, setSource] = useState<GitFileSource | null>(null); const [sourceLoading, setSourceLoading] = useState(false);
  const entities = useMemo(enrichEntities, [git.entities]);
  const selectedEntity = entities.find((entity) => entity.path === selected) ?? null;
  useEffect(() => { void useCollectionStore.getState().loadAll().then(() => useGitStore.getState().refresh()); }, []);
  useEffect(() => { setChecked((current) => current.size ? new Set([...current].filter((path) => entities.some((entity) => entity.path === path))) : new Set(entities.map((entity) => entity.path))); if (!selected || !entities.some((entity) => entity.path === selected)) setSelected(entities[0]?.path ?? null); }, [entities, selected]);
  useEffect(() => { if (!selected) { setSource(null); return; } setSourceLoading(true); void useGitStore.getState().source(selected).then(setSource).catch((error) => onToast({ title: 'Could not load diff', detail: String(error), tone: 'error' })).finally(() => setSourceLoading(false)); }, [onToast, selected]);
  useEffect(() => { const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); }, [onClose]);
  const toggle = (paths: string[]) => setChecked((current) => toggleSelection(current, paths));
  const commit = async (push: boolean) => { try { await storageProvider.flush(); const changed = await git.commit([...checked], message.trim()); if (!changed) throw new Error('Selected files do not contain commit changes'); if (push) await git.push(); setMessage(''); onToast({ title: push ? 'Committed and pushed' : 'Changes committed' }); if (!useGitStore.getState().entities.length) onClose(); } catch (error) { onToast({ title: 'Commit failed', detail: String(error), tone: 'error' }); } };
  const discard = async () => { if (!selectedEntity || !window.confirm(`Discard changes to ${selectedEntity.label}?`)) return; try { await storageProvider.flush(); await git.discard([selectedEntity.path]); await rehydrateWorkspaceStores(workspace); await git.refresh(); onToast({ title: 'Change discarded' }); } catch (error) { onToast({ title: 'Could not discard change', detail: String(error), tone: 'error' }); } };
  const resolve = async (choice: 'mine' | 'theirs') => { if (!selectedEntity) return; try { await invoke('git_resolve_workspace_conflict', { rootPath: workspace.rootPath, path: selectedEntity.path, choice }); await rehydrateWorkspaceStores(workspace); await git.refresh(); onToast({ title: choice === 'mine' ? 'Kept local version' : 'Accepted remote version' }); } catch (error) { onToast({ title: 'Could not resolve conflict', detail: String(error), tone: 'error' }); } };
  const openBoth = async () => { if (!selectedEntity) return; try { const snapshot = await invoke<{ contents: string | null }>('workspace_read_file', { rootPath: workspace.rootPath, relativePath: `${selectedEntity.path}.theirs.json` }); setSource({ before: source?.after ?? source?.before ?? null, after: snapshot.contents }); } catch (error) { onToast({ title: 'Could not open remote version', detail: String(error), tone: 'error' }); } };
  const canCommit = canCommitSelection(checked, message, !!git.inFlight);
  return <div className="git-commit-scrim"><section className="git-commit-sheet" role="dialog" aria-modal="true" aria-labelledby="git-commit-title"><aside className="git-commit-changes"><header><div><span className="label-caps">Working tree</span><h2 id="git-commit-title">Commit Changes</h2></div><button aria-label="Close commit sheet" onClick={onClose}><X size={16} /></button></header><ChangesTree entities={entities} checked={checked} selected={selected} onToggle={toggle} onSelect={setSelected} /><textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Commit message..." /><footer><span><GitBranch size={12} />{git.status?.branch ?? workspace.gitBranch ?? 'main'}</span><button className="git-commit-secondary" disabled={!canCommit} onClick={() => void commit(false)}>Commit</button>{git.status?.hasRemote && <button className="git-commit-primary" disabled={!canCommit} onClick={() => void commit(true)}>Commit and Push</button>}</footer></aside><DiffPanel entity={selectedEntity} source={source} loading={sourceLoading} onDiscard={() => void discard()} onResolve={(choice) => void resolve(choice)} onOpenBoth={() => void openBoth()} /></section></div>;
}
