import { AlertTriangle, Trash2, X } from 'lucide-react';
import type { WorkspaceRecord } from '../../types';

interface Props {
  workspace: WorkspaceRecord | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function WorkspaceDeleteDialog({ workspace, busy, onCancel, onConfirm }: Props) {
  if (!workspace) return null;
  return <div className="modal-backdrop workspace-delete-backdrop">
    <section className="workspace-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="workspace-delete-title">
      <header>
        <span><AlertTriangle size={17} /></span>
        <div><h2 id="workspace-delete-title">Remove “{workspace.name}”?</h2><p>This removes the workspace from TesAPI. Its folder and Git repository stay on disk.</p></div>
        <button aria-label="Cancel workspace removal" disabled={busy} onClick={onCancel}><X size={14} /></button>
      </header>
      <div className="workspace-delete-path"><span>Files remain at</span><code>{workspace.rootPath}</code></div>
      <footer>
        <button className="modal-cancel" disabled={busy} onClick={onCancel}>Cancel</button>
        <button className="modal-delete" disabled={busy} onClick={onConfirm}>{busy ? <span className="spinner" /> : <Trash2 size={13} />}{busy ? 'Removing…' : 'Remove workspace'}</button>
      </footer>
    </section>
  </div>;
}
