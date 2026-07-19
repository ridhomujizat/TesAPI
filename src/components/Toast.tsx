import { CheckCircle2, X, XCircle } from 'lucide-react';
import { useEffect } from 'react';

export interface ToastMessage {
  title: string;
  detail?: string;
  tone?: 'success' | 'error';
}

interface Props {
  message: ToastMessage | null;
  onClose: () => void;
}

export function Toast({ message, onClose }: Props) {
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(onClose, 3800);
    return () => window.clearTimeout(timer);
  }, [message, onClose]);

  if (!message) return null;
  const isError = message.tone === 'error';
  return (
    <div className={`toast${isError ? ' error' : ''}`} role="status">
      {isError ? <XCircle size={15} /> : <CheckCircle2 size={15} />}
      <div className="toast-copy">
        <strong>{message.title}</strong>
        {message.detail && <span>{message.detail}</span>}
      </div>
      <button className="toast-close" aria-label="Dismiss notification" onClick={onClose}><X size={14} /></button>
    </div>
  );
}
