import { X } from 'lucide-react';

interface Props {
  name: string;
  open: boolean;
  onCancel: () => void;
  onDiscard: () => void;
  onSave: () => void;
}

export function CloseTabDialog({ name, open, onCancel, onDiscard, onSave }: Props) {
  if (!open) return null;
  return (
    <div className="modal-backdrop">
      <section className="close-tab-modal" role="dialog" aria-modal="true" aria-labelledby="close-tab-title">
        <div className="save-modal-header">
          <div><h2 id="close-tab-title">Save changes?</h2><p>“{name}” has unsaved changes.</p></div>
          <button className="modal-close" aria-label="Cancel closing tab" onClick={onCancel}><X size={14} /></button>
        </div>
        <div className="save-modal-actions">
          <button className="danger-outline" onClick={onDiscard}>Discard</button>
          <button className="modal-cancel" onClick={onCancel}>Cancel</button>
          <button className="modal-save" onClick={onSave}>Save</button>
        </div>
      </section>
    </div>
  );
}
