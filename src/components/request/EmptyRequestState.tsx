import { Plus } from 'lucide-react';

export function EmptyRequestState({ onNewRequest }: { onNewRequest: () => void }) {
  return <section className="empty-request-state">
    <div className="empty-request-content">
      <span className="empty-request-label">No request selected</span>
      <button className="empty-request-primary" onClick={onNewRequest}><Plus size={12} /> New request</button>
    </div>
  </section>;
}
