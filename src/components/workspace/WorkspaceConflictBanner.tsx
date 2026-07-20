import { RefreshCw, ShieldAlert } from 'lucide-react';
import type { StorageConflict } from '../../types';

interface Props {
  conflict: StorageConflict | null;
  busy: boolean;
  onReload: () => void;
  onKeepMine: () => void;
}

export function WorkspaceConflictBanner({ conflict, busy, onReload, onKeepMine }: Props) {
  if (!conflict) return null;
  return <aside className="workspace-conflict-banner" role="alert">
    <ShieldAlert size={15} />
    <div><strong>Changed on disk</strong><span>{conflict.detail}</span><code>{conflict.path}</code></div>
    <button disabled={busy} onClick={onReload}><RefreshCw size={12} /> Reload</button>
    <button className="primary" disabled={busy} onClick={onKeepMine}>{busy ? 'Applying…' : 'Keep mine'}</button>
  </aside>;
}
