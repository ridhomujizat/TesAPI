import { useRequestStore } from '../../store/requestStore';
import { MethodSelect } from './MethodSelect';

interface Props {
  onSend: () => void;
  onCancel: () => void;
}

export function UrlBar({ onSend, onCancel }: Props) {
  const { request, loading, setMethod, setUrl } = useRequestStore();

  return (
    <div className="urlbar">
      <MethodSelect value={request.method} onChange={setMethod} />
      <input
        className="url-input"
        placeholder="Enter URL or paste cURL"
        spellCheck={false}
        value={request.url}
        onChange={(e) => setUrl(e.target.value)}
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
          Send
        </button>
      )}
    </div>
  );
}
