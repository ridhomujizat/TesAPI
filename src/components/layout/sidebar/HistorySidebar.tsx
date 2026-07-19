import { useCallback, useEffect, useState } from 'react';
import { History, Trash2 } from 'lucide-react';
import { methodColor } from '../../../lib/methods';
import { storageProvider } from '../../../lib/storage/localJson';
import { useRequestStore } from '../../../store/requestStore';
import type { HistoryEntry, HistoryQuery } from '../../../types';
import type { ToastMessage } from '../../Toast';
import { SidebarNav } from './SidebarNav';
import { SidebarSearch } from './SidebarSearch';
import type { SidebarView } from './types';

function dayLabel(timestamp: string): string {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

export function HistorySidebar({ onToast, onViewChange }: { onToast: (message: ToastMessage) => void; onViewChange: (view: SidebarView) => void }) {
  const openUnsaved = useRequestStore((state) => state.openUnsaved);
  const [query, setQuery] = useState('');
  const [method, setMethod] = useState<HistoryQuery['method']>('ALL');
  const [statusClass, setStatusClass] = useState<HistoryQuery['statusClass']>('ALL');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setHistory(await storageProvider.queryHistory({ search: query, method, statusClass, limit: 1000 }));
    } catch (error) {
      onToast({ title: 'Could not load history', detail: String(error), tone: 'error' });
    }
  }, [method, onToast, query, statusClass]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const update = () => void refresh();
    window.addEventListener('tesapi-history-updated', update);
    return () => window.removeEventListener('tesapi-history-updated', update);
  }, [refresh]);

  const clear = async () => {
    setClearing(true);
    try {
      await storageProvider.clearHistory();
      setHistory([]);
      setClearOpen(false);
      onToast({ title: 'History cleared' });
    } catch (error) {
      onToast({ title: 'Could not clear history', detail: String(error), tone: 'error' });
    } finally {
      setClearing(false);
    }
  };

  return <>
    <SidebarNav active="history" onChange={onViewChange} />
    <SidebarSearch placeholder="Search history" value={query} onChange={setQuery}>
      <div className="history-filters"><select value={method} onChange={(event) => setMethod(event.target.value as HistoryQuery['method'])}><option value="ALL">All methods</option>{['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((value) => <option key={value}>{value}</option>)}</select><select value={statusClass} onChange={(event) => setStatusClass(event.target.value as HistoryQuery['statusClass'])}><option value="ALL">All status</option><option value="2xx">2xx</option><option value="3xx">3xx</option><option value="4xx">4xx</option><option value="5xx">5xx</option><option value="error">Network</option></select></div>
    </SidebarSearch>
    <div className="tree history-list"><div className="history-toolbar"><span className="label-caps">History</span><button onClick={() => setClearOpen(true)}><Trash2 size={12} /> Clear</button></div>{history.map((entry, index) => { const label = dayLabel(entry.ts); const previous = index ? dayLabel(history[index - 1].ts) : ''; return <div key={entry.id}>{label !== previous && <div className="history-day label-caps">{label}</div>}<button className="history-entry" onClick={() => openUnsaved(entry.request)}><span className="tree-method" style={{ color: methodColor(entry.method) }}>{entry.method}</span><span className="history-url">{entry.url}</span><span className={`history-status status-${entry.status ? Math.floor(entry.status / 100) : 0}`}>{entry.status || 'ERR'}</span><time>{entry.durationMs} ms</time></button></div>; })}{!history.length && <div className="sidebar-empty"><History size={24} /><span>No history yet</span></div>}</div>
    {clearOpen && <div className="modal-backdrop"><section className="close-tab-modal delete-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="clear-history-title"><div className="save-modal-header"><div><h2 id="clear-history-title">Clear history?</h2><p>All request history will be permanently deleted.</p></div></div><div className="save-modal-actions"><button className="modal-cancel" disabled={clearing} onClick={() => setClearOpen(false)}>Cancel</button><button className="modal-delete" disabled={clearing} onClick={() => void clear()}>{clearing ? 'Clearing…' : 'Clear history'}</button></div></section></div>}
  </>;
}
