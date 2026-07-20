import { useState } from 'react';
import { Eye, ShieldAlert } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { CodeEditor } from '../CodeEditor';
import type { GitConflictFile, GitConflictManifest } from '../../hooks/useGitConflicts';

interface Props { workspaceRoot: string; manifest: GitConflictManifest | null; busy: boolean; onResolve: (file: GitConflictFile, choice: 'mine' | 'theirs') => void }

export function GitConflictBanner({ workspaceRoot, manifest, busy, onResolve }: Props) {
  const [open, setOpen] = useState<GitConflictFile | null>(null);
  const [theirs, setTheirs] = useState('');
  const file = manifest?.files.find((item) => !item.resolved);
  if (!manifest || !file) return null;
  const openBoth = async () => {
    const contents = file.stages.theirs
      ? await invoke<string | null>('read_json', { path: `${workspaceRoot}/${file.path}.theirs.json` })
      : null;
    setTheirs(contents ?? '');
    setOpen(file);
  };
  const kindLabel = file.kind === 'edit-vs-delete' ? 'deleted remotely' : file.kind === 'delete-vs-edit' ? 'deleted locally' : 'conflicting edits';
  const mineLabel = file.kind === 'edit-vs-delete' ? 'Keep mine (restore)' : file.kind === 'delete-vs-edit' ? 'Keep deleted' : 'Keep mine';
  const theirsLabel = file.kind === 'edit-vs-delete' ? 'Accept deletion' : file.kind === 'delete-vs-edit' ? 'Restore theirs' : 'Take theirs';
  return <>
    <aside className="git-conflict-banner" role="alert"><ShieldAlert size={15} /><div><strong>Git conflict</strong><span>{file.path} · {kindLabel}</span></div><button disabled={busy} onClick={() => onResolve(file, 'mine')}>{mineLabel}</button><button disabled={busy} onClick={() => onResolve(file, 'theirs')}>{theirsLabel}</button><button className="subtle" disabled={busy} onClick={() => void openBoth()}><Eye size={12} /> Open both</button></aside>
    {open && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(null); }}><section className="git-conflict-modal" role="dialog" aria-modal="true" aria-labelledby="conflict-preview-title"><header><div><span className="label-caps">Remote version</span><h2 id="conflict-preview-title">{open.path}</h2></div><button aria-label="Close remote preview" onClick={() => setOpen(null)}>×</button></header><div className="git-conflict-editor">{open.stages.theirs ? <CodeEditor value={theirs} readOnly language="json" ariaLabel="Remote conflicting version" /> : <div className="git-conflict-deleted">The remote version deleted this file.</div>}</div><footer><button className="modal-cancel" onClick={() => setOpen(null)}>Close</button><button className="modal-cancel" onClick={() => { onResolve(open, 'theirs'); setOpen(null); }}>{theirsLabel}</button><button className="modal-save" onClick={() => { onResolve(open, 'mine'); setOpen(null); }}>{mineLabel}</button></footer></section></div>}
  </>;
}
