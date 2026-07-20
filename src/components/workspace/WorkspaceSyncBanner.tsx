import { RefreshCw, TriangleAlert } from 'lucide-react';

interface Props { paused: boolean; busy: boolean; onRetry: () => void }

export function WorkspaceSyncBanner({ paused, busy, onRetry }: Props) {
  if (!paused) return null;
  return <aside className="workspace-sync-banner" role="status">
    <TriangleAlert size={15} />
    <div><strong>Git sync paused</strong><span>The remote changed repeatedly. Your local work is safe.</span></div>
    <button disabled={busy} onClick={onRetry}><RefreshCw size={12} /> {busy ? 'Retrying…' : 'Retry sync'}</button>
  </aside>;
}
