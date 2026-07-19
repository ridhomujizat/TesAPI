import { useEffect, useMemo, useState } from 'react';
import { Folder, FolderPlus, X } from 'lucide-react';
import type { GetmanRequest, RequestOrigin } from '../types';
import { requestName, type FlatNode } from '../lib/collections';
import { useCollectionStore } from '../store/collectionStore';
import { methodColor } from '../lib/methods';

interface Props {
  request: GetmanRequest;
  open: boolean;
  onCancel: () => void;
  onSaved: (origin: RequestOrigin, name: string) => void;
  onError?: (message: string) => void;
}

interface Location { collectionId: string; parentId: string | null; label: string }

export function SaveRequestModal({ request, open, onCancel, onSaved, onError }: Props) {
  const { summaries, collectionsById, loadAll, createCollection, createFolder, saveRequest } = useCollectionStore();
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const locations = useMemo(() => {
    const result: Location[] = [];
    const visit = (collectionId: string, node: FlatNode, depth: number) => {
      if (node.type !== 'folder') return;
      result.push({ collectionId, parentId: node.id, label: `${'  '.repeat(depth)}${node.name}` });
      const collection = collectionsById[collectionId];
      for (const childId of collection?.childIdsByParent[node.id] ?? []) {
        const child = collection.nodesById[childId];
        if (child) visit(collectionId, child, depth + 1);
      }
    };
    for (const summary of summaries) {
      result.push({ collectionId: summary.id, parentId: null, label: summary.name });
      const collection = collectionsById[summary.id];
      for (const id of collection?.childIdsByParent.__root__ ?? []) {
        const node = collection.nodesById[id];
        if (node) visit(summary.id, node, 1);
      }
    }
    return result;
  }, [collectionsById, summaries]);

  useEffect(() => {
    if (!open) return;
    setName(requestName(request));
    setSaving(false);
    setError(null);
    void loadAll();
  }, [loadAll, open, request]);

  useEffect(() => {
    if (open && !location && locations[0]) setLocation(`${locations[0].collectionId}|${locations[0].parentId ?? ''}`);
  }, [location, locations, open]);

  if (!open) return null;
  const selected = locations.find((item) => `${item.collectionId}|${item.parentId ?? ''}` === location);
  const activeHeaders = request.headers.filter((header) => header.enabled && header.key).length;
  const bodyLabel = request.body.type === 'none' ? 'no body' : `${request.body.type} body`;

  const addCollection = async () => {
    const value = window.prompt('Collection name');
    if (!value?.trim()) return;
    const collectionId = await createCollection(value);
    setLocation(`${collectionId}|`);
  };

  const addFolder = async () => {
    if (!selected) return;
    const value = window.prompt('Folder name');
    if (!value?.trim()) return;
    const folderId = await createFolder(selected.collectionId, selected.parentId, value);
    setLocation(`${selected.collectionId}|${folderId}`);
  };

  const save = async () => {
    if (!selected || !name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const nodeId = await saveRequest(selected.collectionId, selected.parentId, name, request);
      onSaved({ collectionId: selected.collectionId, nodeId }, name.trim());
    } catch (cause) {
      const message = String(cause);
      setError(message);
      onError?.(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <section className="save-location-modal" role="dialog" aria-modal="true" aria-labelledby="save-request-title">
        <div className="save-modal-header">
          <div><h2 id="save-request-title">Save request</h2><p>Choose where this active request should live.</p></div>
          <button className="modal-close" aria-label="Close save dialog" onClick={onCancel}><X size={14} /></button>
        </div>
        <div className="save-modal-body">
          <label className="save-field">
            <span><b>Request name</b><small>Active tab</small></span>
            <input autoFocus value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void save(); }} />
          </label>
          <label className="save-field">
            <span><b>Folder / location</b><small>Workspace folders</small></span>
            {locations.length ? (
              <div className="save-select"><Folder size={14} /><select value={location} onChange={(event) => setLocation(event.target.value)}>{locations.map((item) => <option key={`${item.collectionId}-${item.parentId}`} value={`${item.collectionId}|${item.parentId ?? ''}`}>{item.label}</option>)}</select></div>
            ) : (
              <button className="save-empty-location" onClick={() => void addCollection()}><FolderPlus size={14} /> Create your first collection</button>
            )}
          </label>
          <div className="save-secondary-actions">
            <button className="outlined-btn" onClick={() => void addCollection()}><FolderPlus size={13} /> New collection</button>
            <button className="outlined-btn" onClick={() => void addFolder()} disabled={!selected}><FolderPlus size={13} /> New folder</button>
          </div>
          <div className="save-request-context">
            <div><span className="save-method" style={{ color: methodColor(request.method) }}>{request.method}</span><code>{request.url || '(no URL)'}</code></div>
            <p>Includes {activeHeaders} headers, {request.auth.type === 'none' ? 'no auth' : `${request.auth.type} auth`}, and {bodyLabel} from the current workspace.</p>
          </div>
          {error && <p className="save-modal-error" role="alert">Could not save: {error}</p>}
        </div>
        <div className="save-modal-actions">
          <button className="modal-cancel" onClick={onCancel}>Cancel</button>
          <button className="modal-save" disabled={!selected || !name.trim() || saving} onClick={() => void save()}><FolderPlus size={14} /> {saving ? 'Saving…' : 'Save'}</button>
        </div>
      </section>
    </div>
  );
}
