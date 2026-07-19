import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import type { GetmanRequest } from '../types';
import { parseCurl } from '../lib/curl';

interface Props {
  open: boolean;
  onClose: () => void;
  onImported: (request: GetmanRequest, warnings: string[]) => void;
}

export function CurlImportModal({ open, onClose, onImported }: Props) {
  const [command, setCommand] = useState('');
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setCommand('');
    setError('');
    setWarnings([]);
    inputRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const importCommand = () => {
    const result = parseCurl(command);
    if (!result.ok) {
      setError(result.error);
      setWarnings([]);
      return;
    }
    onImported(result.request, result.warnings);
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <section className="curl-modal" role="dialog" aria-modal="true" aria-labelledby="curl-modal-title">
        <div className="modal-heading">
          <div><span className="label-caps">Request import</span><h2 id="curl-modal-title">Import cURL</h2></div>
          <button className="icon-button" aria-label="Close import dialog" onClick={onClose}><X size={16} /></button>
        </div>
        <p className="modal-copy">Paste a cURL command from Chrome, Postman, or your terminal.</p>
        <textarea
          ref={inputRef}
          className="curl-textarea"
          value={command}
          onChange={(event) => {
            const value = event.target.value;
            setCommand(value);
            setError('');
            const result = parseCurl(value);
            setWarnings(result.ok ? result.warnings : []);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') onClose();
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') importCommand();
          }}
          placeholder={'curl --request POST \\\n  --url https://example.com/api \\\n  --header \'Content-Type: application/json\''}
          spellCheck={false}
        />
        {error && <p className="modal-error" role="alert"><AlertTriangle size={14} /> {error}</p>}
        {warnings.length > 0 && (
          <div className="modal-warnings"><span className="label-caps">Warnings</span>{warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>
        )}
        <div className="modal-actions">
          <button className="outlined-btn" onClick={onClose}>Cancel</button>
          <button className="send-btn" onClick={importCommand} disabled={!command.trim()}>Import request</button>
        </div>
      </section>
    </div>
  );
}
