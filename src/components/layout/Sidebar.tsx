import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Copy, Folder, FolderPlus, History, Layers3, MoreHorizontal, Plus, Search, Trash2 } from 'lucide-react';
import { useCollectionStore } from '../../store/collectionStore';
import { useEnvironmentStore } from '../../store/environmentStore';
import { newRequest, useRequestStore } from '../../store/requestStore';
import { methodColor } from '../../lib/methods';
import { storageProvider } from '../../lib/storage/localJson';
import type { CollectionSummary, HistoryEntry, HistoryQuery } from '../../types';
import { isDescendant, type FlatNode } from '../../lib/collections';
import type { ToastMessage } from '../Toast';
import { applyRowEdit } from '../../lib/params';

type View = 'collections' | 'history' | 'environments';
type CollectionRow =
  | { key: string; type: 'collection'; collection: CollectionSummary; depth: number }
  | { key: string; type: 'folder' | 'request'; collectionId: string; node: FlatNode; depth: number };
type DropMode = 'before' | 'inside' | 'after';

interface ContextState {
  x: number;
  y: number;
  collectionId: string;
  nodeId?: string;
  type: 'collection' | 'folder' | 'request';
}

interface MoveState {
  sourceCollectionId: string;
  nodeId: string;
  location: string;
}

const ROW_HEIGHT = 32;

function dayLabel(timestamp: string): string {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

export function Sidebar({ onToast }: { onToast: (message: ToastMessage) => void }) {
  const collectionState = useCollectionStore();
  const environmentFile = useEnvironmentStore((state) => state.file);
  const createEnvironment = useEnvironmentStore((state) => state.createEnvironment);
  const setActiveEnvironment = useEnvironmentStore((state) => state.setActive);
  const setEnvironmentVariables = useEnvironmentStore((state) => state.setVariables);
  const { openRequest, openUnsaved } = useRequestStore();
  const [view, setView] = useState<View>('collections');
  const [query, setQuery] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [method, setMethod] = useState<HistoryQuery['method']>('ALL');
  const [statusClass, setStatusClass] = useState<HistoryQuery['statusClass']>('ALL');
  const [context, setContext] = useState<ContextState | null>(null);
  const [move, setMove] = useState<MoveState | null>(null);
  const [dragging, setDragging] = useState<{ collectionId: string; nodeId: string } | null>(null);
  const [drop, setDrop] = useState<{ key: string; mode: DropMode } | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(500);
  const treeRef = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef(0);

  useEffect(() => {
    const element = treeRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setViewportHeight(element.clientHeight));
    observer.observe(element);
    setViewportHeight(element.clientHeight);
    return () => observer.disconnect();
  }, [view]);

  useEffect(() => {
    if (view === 'collections' && query.trim()) void collectionState.loadAll();
  }, [collectionState.loadAll, query, view]);

  const refreshHistory = useCallback(async () => {
    try {
      setHistory(await storageProvider.queryHistory({ search: query, method, statusClass, limit: 1000 }));
    } catch (error) {
      onToast({ title: 'Could not load history', detail: String(error), tone: 'error' });
    }
  }, [method, onToast, query, statusClass]);

  useEffect(() => {
    if (view === 'history') void refreshHistory();
  }, [refreshHistory, view]);

  useEffect(() => {
    if (view !== 'history') return;
    const refresh = () => void refreshHistory();
    window.addEventListener('getman-history-updated', refresh);
    return () => window.removeEventListener('getman-history-updated', refresh);
  }, [refreshHistory, view]);

  useEffect(() => {
    const close = () => setContext(null);
    const cancelDrag = (event: KeyboardEvent) => { if (event.key === 'Escape') { setDragging(null); setDrop(null); } };
    window.addEventListener('click', close);
    window.addEventListener('keydown', cancelDrag);
    return () => { window.removeEventListener('click', close); window.removeEventListener('keydown', cancelDrag); };
  }, []);

  const rows = useMemo(() => {
    const result: CollectionRow[] = [];
    const search = query.trim().toLowerCase();
    if (search) {
      for (const summary of collectionState.summaries) {
        const collection = collectionState.collectionsById[summary.id];
        for (const node of Object.values(collection?.nodesById ?? {})) {
          if (node.type === 'request' && (node.name.toLowerCase().includes(search) || node.request.url.toLowerCase().includes(search))) {
            result.push({ key: `${summary.id}:${node.id}`, type: 'request', collectionId: summary.id, node, depth: 0 });
          }
        }
      }
      return result;
    }
    const visit = (collectionId: string, nodeId: string, depth: number) => {
      const collection = collectionState.collectionsById[collectionId];
      const node = collection?.nodesById[nodeId];
      if (!node) return;
      result.push({ key: `${collectionId}:${node.id}`, type: node.type, collectionId, node, depth });
      if (node.type === 'folder' && collectionState.expandedIds[node.id]) {
        for (const child of collection.childIdsByParent[node.id] ?? []) visit(collectionId, child, depth + 1);
      }
    };
    for (const summary of collectionState.summaries) {
      result.push({ key: summary.id, type: 'collection', collection: summary, depth: 0 });
      if (!collectionState.expandedIds[summary.id]) continue;
      const collection = collectionState.collectionsById[summary.id];
      for (const id of collection?.childIdsByParent.__root__ ?? []) visit(summary.id, id, 1);
    }
    return result;
  }, [collectionState.collectionsById, collectionState.expandedIds, collectionState.summaries, query]);
  const activeEnvironment = environmentFile.environments.find((environment) => environment.id === environmentFile.activeEnvironmentId);
  const moveLocations = useMemo(() => {
    if (!move) return [];
    const result: { value: string; label: string; collectionId: string; parentId: string | null }[] = [];
    const sourceCollection = collectionState.collectionsById[move.sourceCollectionId];
    const sourceNode = sourceCollection?.nodesById[move.nodeId];
    const visit = (collectionId: string, nodeId: string, depth: number) => {
      const collection = collectionState.collectionsById[collectionId];
      const node = collection?.nodesById[nodeId];
      if (!node || node.type !== 'folder') return;
      if (sourceNode?.type === 'folder' && collectionId === move.sourceCollectionId && isDescendant(sourceCollection.nodesById, sourceNode.id, node.id)) return;
      result.push({ value: `${collectionId}|${node.id}`, label: `${'  '.repeat(depth)}${node.name}`, collectionId, parentId: node.id });
      for (const childId of collection.childIdsByParent[node.id] ?? []) visit(collectionId, childId, depth + 1);
    };
    for (const summary of collectionState.summaries) {
      result.push({ value: `${summary.id}|`, label: summary.name, collectionId: summary.id, parentId: null });
      const collection = collectionState.collectionsById[summary.id];
      for (const nodeId of collection?.childIdsByParent.__root__ ?? []) visit(summary.id, nodeId, 1);
    }
    return result;
  }, [collectionState.collectionsById, collectionState.summaries, move]);

  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 5);
  const end = Math.min(rows.length, start + Math.ceil(viewportHeight / ROW_HEIGHT) + 10);

  const toggleCollection = async (summary: CollectionSummary) => {
    const expanded = !collectionState.expandedIds[summary.id];
    if (expanded) await collectionState.loadCollection(summary.id);
    collectionState.setExpanded(summary.id, expanded);
  };

  const openNode = (collectionId: string, node: FlatNode) => {
    if (node.type === 'folder') {
      collectionState.setExpanded(node.id, !collectionState.expandedIds[node.id]);
    } else {
      openRequest(node.request, { collectionId, nodeId: node.id });
    }
  };

  const createCollection = async () => {
    const name = window.prompt('Collection name');
    if (!name?.trim()) return;
    await collectionState.createCollection(name);
  };

  const contextAction = async (action: string) => {
    if (!context) return;
    await useCollectionStore.getState().loadCollection(context.collectionId);
    const store = useCollectionStore.getState();
    const collection = store.collectionsById[context.collectionId];
    const node = context.nodeId ? collection?.nodesById[context.nodeId] : null;
    if (action === 'new-folder') {
      const name = window.prompt('Folder name');
      if (name?.trim()) await store.createFolder(context.collectionId, node?.type === 'folder' ? node.id : null, name);
    } else if (action === 'new-request') {
      openUnsaved(newRequest());
    } else if (action === 'rename') {
      const name = window.prompt('New name', node?.name ?? collection?.name ?? store.summaries.find((item) => item.id === context.collectionId)?.name);
      if (!name?.trim()) return;
      if (node) await store.renameNode(context.collectionId, node.id, name);
      else await store.renameCollection(context.collectionId, name);
    } else if (action === 'duplicate' && node) {
      await store.duplicateNode(context.collectionId, node.id);
    } else if (action === 'delete') {
      if (!window.confirm(`Delete ${node?.name ?? 'this collection'}?`)) return;
      if (node) await store.deleteNode(context.collectionId, node.id);
      else await store.deleteCollection(context.collectionId);
    } else if (action === 'move' && node) {
      await store.loadAll();
      setMove({ sourceCollectionId: context.collectionId, nodeId: node.id, location: `${context.collectionId}|` });
    }
    setContext(null);
  };

  const runContextAction = (action: string) => {
    void contextAction(action).catch((error) => onToast({ title: 'Collection action failed', detail: String(error), tone: 'error' }));
  };

  const confirmMove = async () => {
    if (!move) return;
    const location = moveLocations.find((item) => item.value === move.location);
    if (!location) return;
    try {
      await collectionState.moveNode(move.sourceCollectionId, move.nodeId, location.collectionId, location.parentId);
      setMove(null);
    } catch (error) {
      onToast({ title: 'Could not move item', detail: String(error), tone: 'error' });
    }
  };

  const dropOn = async (row: CollectionRow) => {
    if (!dragging) return;
    try {
      if (row.type === 'collection') {
        await collectionState.loadCollection(row.collection.id);
        await collectionState.moveNode(dragging.collectionId, dragging.nodeId, row.collection.id, null);
      } else if (row.type === 'folder') {
        const mode = drop?.key === row.key ? drop.mode : 'inside';
        const collection = collectionState.collectionsById[row.collectionId];
        const siblings = collection?.childIdsByParent[row.node.parentId ?? '__root__'] ?? [];
        const index = mode === 'inside' ? undefined : siblings.indexOf(row.node.id) + (mode === 'after' ? 1 : 0);
        await collectionState.moveNode(dragging.collectionId, dragging.nodeId, row.collectionId, mode === 'inside' ? row.node.id : row.node.parentId, index);
      } else {
        const collection = collectionState.collectionsById[row.collectionId];
        const siblings = collection.childIdsByParent[row.node.parentId ?? '__root__'] ?? [];
        const mode = drop?.key === row.key ? drop.mode : 'before';
        await collectionState.moveNode(dragging.collectionId, dragging.nodeId, row.collectionId, row.node.parentId, siblings.indexOf(row.node.id) + (mode === 'after' ? 1 : 0));
      }
    } catch (error) {
      onToast({ title: 'Could not move item', detail: String(error), tone: 'error' });
    } finally {
      setDragging(null);
      setDrop(null);
    }
  };

  const dragOver = (event: React.DragEvent, row: CollectionRow) => {
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = bounds.height ? (event.clientY - bounds.top) / bounds.height : 0.5;
    const mode: DropMode = row.type === 'collection'
      ? 'inside'
      : row.type === 'folder'
        ? ratio < 0.25 ? 'before' : ratio > 0.75 ? 'after' : 'inside'
        : ratio < 0.5 ? 'before' : 'after';
    const sourceCollection = dragging ? collectionState.collectionsById[dragging.collectionId] : undefined;
    const invalid = !!dragging && row.type === 'folder' && mode === 'inside' && dragging.collectionId === row.collectionId && !!sourceCollection && isDescendant(sourceCollection.nodesById, dragging.nodeId, row.node.id);
    event.dataTransfer.dropEffect = invalid ? 'none' : 'move';
    setDrop({ key: row.key, mode });
    window.clearTimeout(hoverTimer.current);
    if (row.type === 'folder' && mode === 'inside' && !collectionState.expandedIds[row.node.id]) {
      hoverTimer.current = window.setTimeout(() => collectionState.setExpanded(row.node.id, true), 600);
    }
    const tree = treeRef.current;
    if (!tree) return;
    const treeBounds = tree.getBoundingClientRect();
    if (event.clientY < treeBounds.top + 32) tree.scrollTop -= 20;
    if (event.clientY > treeBounds.bottom - 32) tree.scrollTop += 20;
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <button className={`icon-button${view === 'collections' ? ' active' : ''}`} title="Collections" onClick={() => setView('collections')}><Folder size={15} /></button>
        <button className={`icon-button${view === 'history' ? ' active' : ''}`} title="History" onClick={() => setView('history')}><History size={15} /></button>
        <button className={`icon-button${view === 'environments' ? ' active' : ''}`} title="Environments" onClick={() => setView('environments')}><Layers3 size={15} /></button>
        {view === 'collections' && <button className="icon-button sidebar-add" title="New collection" onClick={() => void createCollection()}><Plus size={15} /></button>}
      </div>
      <div className="sidebar-search">
        <div className="search-box"><Search size={13} color="var(--text-muted)" /><input placeholder={view === 'history' ? 'Search history' : 'Search requests'} spellCheck={false} value={query} onChange={(event) => setQuery(event.target.value)} /><kbd>⌘K</kbd></div>
        {view === 'history' && <div className="history-filters"><select value={method} onChange={(event) => setMethod(event.target.value as HistoryQuery['method'])}><option value="ALL">All methods</option>{['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((value) => <option key={value}>{value}</option>)}</select><select value={statusClass} onChange={(event) => setStatusClass(event.target.value as HistoryQuery['statusClass'])}><option value="ALL">All status</option><option value="2xx">2xx</option><option value="3xx">3xx</option><option value="4xx">4xx</option><option value="5xx">5xx</option><option value="error">Network</option></select></div>}
      </div>

      {view === 'collections' && (
        <div className="tree virtual-tree" ref={treeRef} onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
          {!rows.length && <div className="sidebar-empty"><FolderPlus size={24} /><span>{query ? 'No matching requests' : 'No collections yet'}</span>{!query && <button onClick={() => void createCollection()}>New collection</button>}</div>}
          <div className="virtual-tree-space" style={{ height: rows.length * ROW_HEIGHT }}>
            {rows.slice(start, end).map((row, offset) => {
              const top = (start + offset) * ROW_HEIGHT;
              if (row.type === 'collection') {
                const expanded = !!collectionState.expandedIds[row.collection.id];
                return <div className={`virtual-tree-row collection-tree-row${drop?.key === row.key ? ` drop-${drop?.mode}` : ''}`} key={row.key} style={{ top }} onDragOver={(event) => dragOver(event, row)} onDragLeave={() => setDrop(null)} onDrop={() => void dropOn(row)} onContextMenu={(event) => { event.preventDefault(); setContext({ x: event.clientX, y: event.clientY, collectionId: row.collection.id, type: 'collection' }); }}><button onClick={() => void toggleCollection(row.collection)}>{expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}<Folder size={13} /><span>{row.collection.name}</span><small>{row.collection.requestCount}</small></button><MoreHorizontal size={13} /></div>;
              }
              const expanded = row.type === 'folder' && !!collectionState.expandedIds[row.node.id];
              return <button className={`virtual-tree-row node-tree-row${row.type === 'request' ? ' request' : ''}${drop?.key === row.key ? ` drop-${drop?.mode}` : ''}`} key={row.key} style={{ top, paddingLeft: 8 + row.depth * 16 }} draggable onDragStart={(event) => { setDragging({ collectionId: row.collectionId, nodeId: row.node.id }); event.dataTransfer.effectAllowed = 'move'; }} onDragEnd={() => { setDragging(null); setDrop(null); }} onDragOver={(event) => dragOver(event, row)} onDragLeave={() => setDrop(null)} onDrop={(event) => { event.stopPropagation(); void dropOn(row); }} onContextMenu={(event) => { event.preventDefault(); setContext({ x: event.clientX, y: event.clientY, collectionId: row.collectionId, nodeId: row.node.id, type: row.type }); }} onClick={() => openNode(row.collectionId, row.node)}>{row.type === 'folder' ? (expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : <span className="tree-method" style={{ color: methodColor(row.node.type === 'request' ? row.node.request.method : 'GET') }}>{row.node.type === 'request' ? row.node.request.method : ''}</span>}{row.type === 'folder' && <Folder size={13} />}<span>{row.node.name}</span></button>;
            })}
          </div>
        </div>
      )}

      {view === 'history' && <div className="tree history-list"><div className="history-toolbar"><span className="label-caps">History</span><button onClick={() => { if (window.confirm('Clear all history?')) void storageProvider.clearHistory().then(refreshHistory); }}><Trash2 size={12} /> Clear</button></div>{history.map((entry, index) => { const label = dayLabel(entry.ts); const previous = index ? dayLabel(history[index - 1].ts) : ''; return <div key={entry.id}>{label !== previous && <div className="history-day label-caps">{label}</div>}<button className="history-entry" onClick={() => openUnsaved(entry.request)}><span className="tree-method" style={{ color: methodColor(entry.method) }}>{entry.method}</span><span className="history-url">{entry.url}</span><span className={`history-status status-${entry.status ? Math.floor(entry.status / 100) : 0}`}>{entry.status || 'ERR'}</span><time>{entry.durationMs} ms</time></button></div>; })}{!history.length && <div className="sidebar-empty"><History size={24} /><span>No history yet</span></div>}</div>}

      {view === 'environments' && <div className="tree environment-editor"><div className="environment-toolbar"><select value={environmentFile.activeEnvironmentId ?? ''} onChange={(event) => void setActiveEnvironment(event.target.value || null)}><option value="">No environment</option>{environmentFile.environments.map((environment) => <option key={environment.id} value={environment.id}>{environment.name}</option>)}</select><button title="New environment" onClick={() => { const name = window.prompt('Environment name'); if (name?.trim()) void createEnvironment(name); }}><Plus size={13} /></button></div>{activeEnvironment ? <div className="environment-rows">{activeEnvironment.variables.map((variable) => <div className={`environment-variable${variable.enabled ? '' : ' disabled'}`} key={variable.id}><input type="checkbox" checked={variable.enabled} onChange={(event) => void setEnvironmentVariables(activeEnvironment.id, activeEnvironment.variables.map((item) => item.id === variable.id ? { ...item, enabled: event.target.checked } : item))} /><input placeholder="Variable" value={variable.key} onChange={(event) => void setEnvironmentVariables(activeEnvironment.id, activeEnvironment.variables.map((item) => item.id === variable.id ? applyRowEdit(item, { key: event.target.value }) : item))} /><input placeholder="Value" value={variable.value} onChange={(event) => void setEnvironmentVariables(activeEnvironment.id, activeEnvironment.variables.map((item) => item.id === variable.id ? applyRowEdit(item, { value: event.target.value }) : item))} /></div>)}</div> : <div className="sidebar-empty"><Layers3 size={24} /><span>No environments yet</span><button onClick={() => { const name = window.prompt('Environment name'); if (name?.trim()) void createEnvironment(name); }}>New environment</button></div>}</div>}

      {context && <div className="context-menu" style={{ left: context.x, top: context.y }} onClick={(event) => event.stopPropagation()}>{context.type !== 'request' && <button onClick={() => runContextAction('new-folder')}><FolderPlus size={13} /> New folder</button>}<button onClick={() => runContextAction('new-request')}><Plus size={13} /> New request</button><button onClick={() => runContextAction('rename')}>Rename</button>{context.type === 'request' && <button onClick={() => runContextAction('duplicate')}><Copy size={13} /> Duplicate</button>}{context.type !== 'collection' && <button onClick={() => runContextAction('move')}>Move to…</button>}<button className="danger" onClick={() => runContextAction('delete')}><Trash2 size={13} /> Delete</button></div>}

      {move && <div className="modal-backdrop"><section className="save-location-modal move-location-modal" role="dialog" aria-modal="true" aria-labelledby="move-location-title"><div className="save-modal-header"><div><h2 id="move-location-title">Move item</h2><p>Choose a collection or nested folder.</p></div><button className="modal-close" aria-label="Close move dialog" onClick={() => setMove(null)}>×</button></div><label className="save-field"><span><b>Folder / location</b><small>Workspace folders</small></span><div className="save-select"><Folder size={14} /><select value={move.location} onChange={(event) => setMove({ ...move, location: event.target.value })}>{moveLocations.map((location) => <option key={location.value} value={location.value}>{location.label}</option>)}</select></div></label><div className="save-modal-actions"><button className="modal-cancel" onClick={() => setMove(null)}>Cancel</button><button className="modal-save" disabled={!moveLocations.length} onClick={() => void confirmMove()}>Move</button></div></section></div>}
    </aside>
  );
}
