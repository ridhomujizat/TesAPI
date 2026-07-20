import { useEffect, useRef, useState } from 'react';
import { BookmarkPlus, X } from 'lucide-react';
import type { TesApiResponse } from '../../types';
import { formatBytes } from '../../lib/http';

interface Props {
  open: boolean;
  requestName: string;
  response: TesApiResponse | null;
  existingNames: string[];
  onCancel: () => void;
  onSave: (name: string) => Promise<void>;
}

function availableName(response: TesApiResponse, existingNames: string[]): string {
  const base = response.status >= 200 && response.status < 300 ? 'Success' : response.statusText || `Response ${response.status}`;
  const used = new Set(existingNames.map((name) => name.toLowerCase()));
  if (!used.has(base.toLowerCase())) return base;
  let suffix = 2;
  while (used.has(`${base} ${suffix}`.toLowerCase())) suffix += 1;
  return `${base} ${suffix}`;
}

export function SaveResponseModal({ open, requestName, response, existingNames, onCancel, onSave }: Props) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || !response) return;
    setName(availableName(response, existingNames)); setError(''); setSaving(false);
    window.setTimeout(() => inputRef.current?.select(), 30);
  }, [existingNames, open, response]);

  if (!open || !response) return null;
  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true); setError('');
    try { await onSave(name.trim()); }
    catch (cause) { setError(String(cause).replace(/^Error:\s*/, '')); }
    finally { setSaving(false); }
  };

  return <div className="modal-backdrop save-response-backdrop">
    <section className="save-response-modal" role="dialog" aria-modal="true" aria-labelledby="save-response-title">
      <header><div><h2 id="save-response-title">Save response</h2><p>Add this response below “{requestName || 'Untitled request'}”.</p></div><button aria-label="Close save response" disabled={saving} onClick={onCancel}><X size={14} /></button></header>
      <div className="save-response-body">
        <div className="save-response-summary"><strong className={`status-${Math.floor(response.status / 100)}`}>{response.status} {response.statusText}</strong><span>{response.timeMs} ms</span><span>{formatBytes(response.sizeBytes)}</span></div>
        <label className="workspace-field"><span>Response name <small>{existingNames.length} saved</small></span><input ref={inputRef} value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void submit(); if (event.key === 'Escape') onCancel(); }} /></label>
        {error && <div className="save-modal-error">{error}</div>}
      </div>
      <footer><button className="modal-cancel" disabled={saving} onClick={onCancel}>Cancel</button><button className="modal-save" disabled={saving || !name.trim()} onClick={() => void submit()}>{saving ? <span className="spinner" /> : <BookmarkPlus size={13} />}{saving ? 'Saving…' : 'Save response'}</button></footer>
    </section>
  </div>;
}
