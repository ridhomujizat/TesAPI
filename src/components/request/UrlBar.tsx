import { useRequestStore } from '../../store/requestStore';
import { MethodSelect } from './MethodSelect';
import { Send as SendIcon } from 'lucide-react';
import { isCurlCommand, parseCurl } from '../../lib/curl';
import type { ToastMessage } from '../Toast';
import { VariableInput } from '../VariableInput';
import { useRequestVariables } from '../../store/variableStatus';
import { useEnvironmentStore } from '../../store/environmentStore';
import { substitute } from '../../lib/environments';
import { OPEN_VARIABLES_EVENT } from '../VariablePopover';

interface Props {
  onSend: () => void;
  onCancel: () => void;
  onToast: (message: ToastMessage) => void;
}

export function UrlBar({ onSend, onCancel, onToast }: Props) {
  const { request, loading, setMethod, setUrl, replaceRequest } = useRequestStore();
  const variables = useRequestVariables(request);
  const environmentFile = useEnvironmentStore((state) => state.file);
  const unresolvedCount = variables.filter((variable) => variable.state === 'unresolved').length;
  const activeRows = environmentFile.environments.find((environment) => environment.id === environmentFile.activeEnvironmentId)?.variables ?? [];
  const environmentMap = Object.fromEntries(activeRows.filter((row) => row.enabled && row.key).map((row) => [row.key, row.value]));
  const unresolvedUrl = new Set<string>();
  const resolvedUrl = request.url.includes('{{') ? substitute(request.url, environmentMap, unresolvedUrl) : '';

  return (
    <div className="urlbar">
      <MethodSelect value={request.method} onChange={setMethod} />
      <VariableInput
        className="url-input"
        title={resolvedUrl && unresolvedUrl.size === 0 ? `Resolved URL: ${resolvedUrl}` : undefined}
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
      {unresolvedCount > 0 && (
        <button className="unresolved-badge" aria-label={`${unresolvedCount} unresolved variables`} title="Fix unresolved variables" onClick={() => window.dispatchEvent(new Event(OPEN_VARIABLES_EVENT))}>{unresolvedCount}</button>
      )}
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
