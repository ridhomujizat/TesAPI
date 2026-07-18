import { useState } from 'react';
import { JsonView, darkStyles } from 'react-json-view-lite';
import 'react-json-view-lite/dist/index.css';
import { Copy, Inbox } from 'lucide-react';
import { useRequestStore } from '../../store/requestStore';
import { StatusBadge } from './StatusBadge';
import { HeadersTable } from './HeadersTable';
import { formatBytes } from '../../lib/http';

type Tab = 'body' | 'headers';

export function ResponseViewer() {
  const { response, error, loading } = useRequestStore();
  const [tab, setTab] = useState<Tab>('body');
  const [raw, setRaw] = useState(false);

  if (loading && !response) {
    return (
      <div className="response">
        <div className="empty-state">
          <span className="spinner" style={{ borderTopColor: 'var(--accent)' }} />
          Sending request…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="response">
        <div className="empty-state error-state">{error}</div>
      </div>
    );
  }

  if (!response) {
    return (
      <div className="response">
        <div className="empty-state">
          <Inbox size={20} />
          Hit Send to see the response
        </div>
      </div>
    );
  }

  let parsed: unknown = null;
  const ct = response.headers['content-type'] ?? '';
  const looksJson = ct.includes('json') || response.body.trim().startsWith('{') || response.body.trim().startsWith('[');
  if (looksJson) {
    try {
      parsed = JSON.parse(response.body);
    } catch {
      parsed = null;
    }
  }

  const copy = () => navigator.clipboard.writeText(response.body);

  return (
    <div className="response">
      <div className="resp-summary">
        <StatusBadge status={response.status} statusText={response.statusText} />
        <span className="resp-meta">
          <b>{response.timeMs}</b> ms
        </span>
        <span className="resp-meta">
          <b>{formatBytes(response.sizeBytes)}</b>
        </span>
      </div>

      <div className="tabs">
        <button className={`tab${tab === 'body' ? ' active' : ''}`} onClick={() => setTab('body')}>
          Body
        </button>
        <button
          className={`tab${tab === 'headers' ? ' active' : ''}`}
          onClick={() => setTab('headers')}
        >
          Headers<span className="count"> · {Object.keys(response.headers).length}</span>
        </button>
        <div className="resp-actions">
          {tab === 'body' && parsed != null && (
            <button className="btn-ghost" onClick={() => setRaw((r) => !r)}>
              {raw ? 'Pretty' : 'Raw'}
            </button>
          )}
          {tab === 'body' && (
            <button className="btn-ghost" onClick={copy} title="Copy">
              <Copy size={13} />
            </button>
          )}
        </div>
      </div>

      <div className="pane-body">
        {tab === 'headers' ? (
          <HeadersTable headers={response.headers} />
        ) : parsed != null && !raw ? (
          <div className="json-wrap">
            <JsonView data={parsed as object} style={darkStyles} />
          </div>
        ) : (
          <pre className="raw-body">{response.body || '(empty body)'}</pre>
        )}
      </div>
    </div>
  );
}
