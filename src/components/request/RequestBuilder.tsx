import { useState } from 'react';
import { useRequestStore } from '../../store/requestStore';
import { UrlBar } from './UrlBar';
import { KeyValueEditor } from './KeyValueEditor';
import { BodyEditor } from './BodyEditor';
import { AuthEditor } from './AuthEditor';

type Tab = 'params' | 'headers' | 'body' | 'auth';

interface Props {
  onSend: () => void;
  onCancel: () => void;
}

const activeCount = (rows: { key: string; enabled: boolean }[]) =>
  rows.filter((r) => r.enabled && r.key !== '').length;

export function RequestBuilder({ onSend, onCancel }: Props) {
  const [tab, setTab] = useState<Tab>('params');
  const { request, setParams, setHeaders, setBody, setAuth } = useRequestStore();

  const paramN = activeCount(request.params);
  const headerN = activeCount(request.headers);

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'params', label: 'Params', count: paramN || undefined },
    { id: 'headers', label: 'Headers', count: headerN || undefined },
    { id: 'body', label: 'Body' },
    { id: 'auth', label: 'Auth' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
      <UrlBar onSend={onSend} onCancel={onCancel} />

      <div className="tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`tab${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.count != null && <span className="count"> · {t.count}</span>}
            {t.id === 'auth' && request.auth.type !== 'none' && <span className="count"> ·</span>}
          </button>
        ))}
      </div>

      <div className="pane-body">
        {tab === 'params' && <KeyValueEditor rows={request.params} onChange={setParams} />}
        {tab === 'headers' && <KeyValueEditor rows={request.headers} onChange={setHeaders} />}
        {tab === 'body' && <BodyEditor body={request.body} onChange={setBody} />}
        {tab === 'auth' && <AuthEditor auth={request.auth} onChange={setAuth} />}
      </div>
    </div>
  );
}
