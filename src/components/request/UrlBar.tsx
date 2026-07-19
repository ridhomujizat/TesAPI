import { useRequestStore } from '../../store/requestStore';
import { MethodSelect } from './MethodSelect';
import { Send as SendIcon } from 'lucide-react';
import { isCurlCommand, parseCurl } from '../../lib/curl';
import type { ToastMessage } from '../Toast';

interface Props {
  onSend: () => void;
  onCancel: () => void;
  onToast: (message: ToastMessage) => void;
}

export function UrlBar({ onSend, onCancel, onToast }: Props) {
  const { request, loading, setMethod, setUrl, replaceRequest } = useRequestStore();

  return (
    <div className="urlbar">
      <MethodSelect value={request.method} onChange={setMethod} />
      <input
        className="url-input"
        placeholder="Enter URL or paste cURL"
        spellCheck={false}
        value={request.url}
        onChange={(e) => setUrl(e.target.value)}
        onPaste={(e) => {
          const text = e.clipboardData.getData('text/plain') || e.clipboardData.getData('text');
          if (!isCurlCommand(text)) return;
          e.preventDefault();
          e.stopPropagation();
          const result = parseCurl(text);
          if (!result.ok) {
            onToast({ title: 'Could not import cURL', detail: result.error, tone: 'error' });
            return;
          }
          replaceRequest(result.request);
          onToast({ title: 'Imported from cURL', detail: result.warnings.length ? result.warnings.join(' · ') : undefined });
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSend();
        }}
      />
      {loading ? (
        <button className="send-btn cancel" onClick={onCancel}>
          <span className="spinner" /> Cancel
        </button>
      ) : (
        <button className="send-btn" onClick={onSend} disabled={!request.url.trim()}>
          <SendIcon size={13} />
          Send
        </button>
      )}
    </div>
  );
}
