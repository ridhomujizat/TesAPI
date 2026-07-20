import { X } from 'lucide-react';
import type { GitLogEntry } from '../../../lib/git/types';

function relativeTime(timestamp: number): string {
  const seconds = timestamp - Math.floor(Date.now() / 1000);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [['day', 86400], ['hour', 3600], ['minute', 60]];
  const [unit, size] = units.find(([, value]) => Math.abs(seconds) >= value) ?? ['second', 1];
  return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(Math.round(seconds / size), unit);
}

export function GitHistoryDialog({ entries, onClose }: { entries: GitLogEntry[]; onClose: () => void }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="git-history-dialog" role="dialog" aria-modal="true" aria-labelledby="git-history-title"><header><div><span className="label-caps">Git history</span><h2 id="git-history-title">Recent commits</h2></div><button aria-label="Close history" onClick={onClose}><X size={15} /></button></header><div className="git-history-list">{entries.length ? entries.map((entry) => <article key={entry.oid}><div className="git-history-row"><strong>{entry.message}</strong><time title={new Date(entry.timestamp * 1000).toLocaleString()}>{relativeTime(entry.timestamp)}</time></div><p>{entry.author} · {entry.paths.length} changed {entry.paths.length === 1 ? 'file' : 'files'}{entry.paths[0] ? ` · ${entry.paths[0]}` : ''}</p></article>) : <div className="git-dialog-empty">No commits yet.</div>}</div></section></div>;
}
