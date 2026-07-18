import { Folder, History, Globe, Search } from 'lucide-react';
import { useRequestStore } from '../../store/requestStore';
import { methodColor } from '../../lib/methods';

// ponytail: static shell — Collections/History/Environments are P3. Renders the active
// request only so the 3-pane layout matches the design; wire real data in phase 3.
export function Sidebar() {
  const { request } = useRequestStore();
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <button className="btn-ghost hoverable" title="Collections">
          <Folder size={16} />
        </button>
        <button className="btn-ghost hoverable" title="History">
          <History size={16} />
        </button>
        <button className="btn-ghost hoverable" title="Environments">
          <Globe size={16} />
        </button>
        <span style={{ marginLeft: 'auto', fontWeight: 600, fontSize: 12 }}>GetMan</span>
      </div>
      <div className="sidebar-search">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Search size={13} color="var(--text-muted)" />
          <input placeholder="Search" spellCheck={false} />
        </div>
      </div>
      <div className="tree">
        <div className="tree-group label-caps">Current request</div>
        <div className="tree-row hoverable">
          <span
            className="mono"
            style={{ color: methodColor(request.method), fontWeight: 600, fontSize: 10 }}
          >
            {request.method}
          </span>
          <span>{request.name || request.url || 'Untitled request'}</span>
        </div>
      </div>
    </aside>
  );
}
