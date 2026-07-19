import { X } from 'lucide-react';

interface Props {
  open: boolean;
  workspaceName: string;
  saving: boolean;
  onCancel: () => void;
  onDiscard: () => void;
  onSaveAll: () => void;
}

export function WorkspaceSwitchDialog({ open, workspaceName, saving, onCancel, onDiscard, onSaveAll }: Props) {
  if (!open) return null;
  return <div className="modal-backdrop">
    <section className="close-tab-modal workspace-switch-dialog" role="dialog" aria-modal="true" aria-labelledby="workspace-switch-title">
      <div className="save-modal-header"><div><h2 id="workspace-switch-title">Save changes before switching?</h2><p>Unsaved request tabs must be handled before opening “{workspaceName}” here.</p></div><button className="modal-close" disabled={saving} aria-label="Cancel workspace switch" onClick={onCancel}><X size={14} /></button></div>
      <div className="save-modal-actions"><button className="danger-outline" disabled={saving} onClick={onDiscard}>Discard</button><button className="modal-cancel" disabled={saving} onClick={onCancel}>Cancel</button><button className="modal-save" disabled={saving} onClick={onSaveAll}>{saving ? 'Saving…' : 'Save all'}</button></div>
    </section>
  </div>;
}
