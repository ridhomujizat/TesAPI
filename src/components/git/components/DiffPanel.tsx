import { useEffect, useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { lineDiff, type DiffRow } from '../../../lib/git/lineDiff';
import type { GitFileSource } from '../../../lib/git/types';
import type { CommitEntity } from './ChangesTree';

interface VisibleDiffRow extends DiffRow { sourceIndex: number }

function DiffLine({ line, tone }: { line?: string; tone: 'before' | 'after' }) {
  const key = line?.match(/^(\s*)"([^"]+)"(.*)$/);
  return <code className={`git-diff-line ${tone}`} title={line}>{key ? <><span>{key[1]}</span><b>"{key[2]}"</b><span>{key[3]}</span></> : line ?? ' '}</code>;
}

export function DiffPanel({ entity, source, loading, onDiscard, onResolve, onOpenBoth }: { entity: CommitEntity | null; source: GitFileSource | null; loading: boolean; onDiscard: () => void; onResolve: (choice: 'mine' | 'theirs') => void; onOpenBoth: () => void }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  useEffect(() => setExpanded(new Set()), [entity?.path]);
  const rows = useMemo(() => source ? lineDiff(source.before, source.after) : [], [source]);
  const visibleRows = rows.flatMap<VisibleDiffRow>((row, index) => row.kind === 'fold' && expanded.has(index) ? (row.lines ?? []).map((line) => ({ kind: 'same', before: line, after: line, sourceIndex: index })) : [{ ...row, sourceIndex: index }]);
  const mode = source?.before == null ? 'after-only' : source.after == null ? 'before-only' : 'both';
  if (!entity) return <section className="git-diff-panel git-diff-empty">Select a changed request to review it.</section>;
  return <section className="git-diff-panel"><header><div><strong>{entity.label}</strong><span>({entity.status})</span></div><div className="git-diff-actions">{entity.status === 'conflicted' ? <><button onClick={() => onResolve('mine')}>Keep mine</button><button onClick={() => onResolve('theirs')}>Take theirs</button><button onClick={onOpenBoth}>Open both</button></> : <button onClick={onDiscard}><RotateCcw size={12} />Discard</button>}</div></header>{loading ? <div className="git-diff-empty"><span className="spinner" /></div> : <div className={`git-diff-body ${mode}`}><div className="git-diff-head">{mode !== 'after-only' && <span>Before</span>}{mode !== 'before-only' && <span>After</span>}</div>{visibleRows.map((row, index) => row.kind === 'fold' ? <button key={`fold-${row.sourceIndex}`} className="git-diff-fold" onClick={() => setExpanded((current) => new Set(current).add(row.sourceIndex))}>{row.count} unchanged lines</button> : <div key={`line-${index}`} className={`git-diff-row ${row.kind}`}>{mode !== 'after-only' && <DiffLine tone="before" line={row.before} />}{mode !== 'before-only' && <DiffLine tone="after" line={row.after} />}</div>)}</div>}</section>;
}
