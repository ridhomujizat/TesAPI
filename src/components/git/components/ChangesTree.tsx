import { FileJson, Folder, Layers3 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { ChangedEntity } from '../../../lib/git/status';
import { selectionState } from '../../../lib/git/selection';

export interface CommitEntity extends ChangedEntity {
  collectionName: string;
  ancestors: string[];
}

function TriCheckbox({ checked, mixed, onChange }: { checked: boolean; mixed: boolean; onChange: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = mixed; }, [mixed]);
  return <input ref={ref} type="checkbox" checked={checked} onChange={onChange} />;
}

export function ChangesTree({ entities, checked, selected, onToggle, onSelect }: { entities: CommitEntity[]; checked: Set<string>; selected: string | null; onToggle: (paths: string[]) => void; onSelect: (path: string) => void }) {
  const grouped = entities.reduce<Record<string, CommitEntity[]>>((result, entity) => {
    const key = entity.collectionId ?? 'workspace';
    (result[key] ??= []).push(entity);
    return result;
  }, {});
  const groups = Object.entries(grouped);
  const renderLevel = (rows: CommitEntity[], depth: number, key: string): React.ReactNode => {
    const leaves = rows.filter((entity) => !entity.ancestors[depth]);
    const folders = Object.entries(rows.filter((entity) => entity.ancestors[depth]).reduce<Record<string, CommitEntity[]>>((result, entity) => { (result[entity.ancestors[depth]] ??= []).push(entity); return result; }, {}));
    return <>{leaves.map((entity) => <button key={entity.path} className={`git-change-row${selected === entity.path ? ' selected' : ''}`} style={{ '--git-indent': depth } as React.CSSProperties} onClick={() => onSelect(entity.path)}><input type="checkbox" checked={checked.has(entity.path)} onClick={(event) => event.stopPropagation()} onChange={() => onToggle([entity.path])} /><FileJson size={12} /><span>{entity.label}</span><em className={entity.status}>{entity.status}</em></button>)}{folders.map(([folder, folderRows]) => { const paths = folderRows.map((entity) => entity.path); const state = selectionState(checked, paths); return <div key={`${key}/${folder}`}><div className="git-change-folder" style={{ '--git-indent': depth } as React.CSSProperties}><TriCheckbox checked={state.checked} mixed={state.mixed} onChange={() => onToggle(paths)} /><Folder size={12} /><span>{folder}</span></div>{renderLevel(folderRows, depth + 1, `${key}/${folder}`)}</div>; })}</>;
  };
  return <div className="git-changes-tree">{groups.map(([group, children]) => {
    const rows = children ?? []; const paths = rows.map((entity) => entity.path); const state = selectionState(checked, paths);
    return <section key={group}><div className="git-change-parent"><TriCheckbox checked={state.checked} mixed={state.mixed} onChange={() => onToggle(paths)} /><Layers3 size={13} /><strong>{rows[0]?.collectionName ?? 'Workspace'}</strong><small>{rows.length}</small></div>{renderLevel(rows, 0, group)}</section>;
  })}</div>;
}
