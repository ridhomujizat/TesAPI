import { useEffect, useRef, useState } from 'react';
import { Check, Copy, CornerDownRight, Plus, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useEnvironmentStore } from '../store/environmentStore';
import type { VarStatus } from '../lib/variables';

export const OPEN_VARIABLES_EVENT = 'tesapi-open-variables';

export type AnchorBox = { left: number; right: number; top: number; bottom: number };

function reasonText(status: VarStatus): string {
  if (status.reason === 'no-environment') return 'No environment selected';
  if (status.reason === 'disabled') return `Disabled in ${status.envName}`;
  return `Not defined in ${status.envName ?? 'the active environment'}`;
}

interface QuickAddProps {
  name: string;
  initialValue?: string;
  compact?: boolean;
  onSaved?: () => void;
}

export function QuickAddVariable({ name, initialValue = '', compact = false, onSaved }: QuickAddProps) {
  const file = useEnvironmentStore((state) => state.file);
  const createEnvironment = useEnvironmentStore((state) => state.createEnvironment);
  const setVariable = useEnvironmentStore((state) => state.setVariable);
  const setActive = useEnvironmentStore((state) => state.setActive);
  const [value, setValue] = useState(initialValue);
  const [target, setTarget] = useState(file.activeEnvironmentId ?? 'new');
  const [newName, setNewName] = useState('Local');
  const [saving, setSaving] = useState(false);

  useEffect(() => setValue(initialValue), [initialValue]);
  useEffect(() => {
    if (target !== 'new' && !file.environments.some((environment) => environment.id === target)) {
      setTarget(file.activeEnvironmentId ?? file.environments[0]?.id ?? 'new');
    }
  }, [file.activeEnvironmentId, file.environments, target]);

  const save = async () => {
    setSaving(true);
    try {
      if (target === 'new') await createEnvironment(newName, { key: name, value });
      else {
        await setVariable(target, name, value);
        await setActive(target);
      }
      onSaved?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`variable-quick-add${compact ? ' compact' : ''}`}>
      <input aria-label={`Value for ${name}`} autoFocus={!compact} placeholder="Enter value" value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void save(); }} />
      {file.environments.length > 0 && (
        <select aria-label="Add variable to" value={target} onChange={(event) => setTarget(event.target.value)}>
          {file.environments.map((environment) => <option key={environment.id} value={environment.id}>{environment.name}</option>)}
          <option value="new">+ New environment</option>
        </select>
      )}
      {(target === 'new' || file.environments.length === 0) && <input aria-label="New environment name" placeholder="Environment name" value={newName} onChange={(event) => setNewName(event.target.value)} />}
      <button className="variable-save" disabled={saving || (target === 'new' && !newName.trim())} onClick={() => void save()}>
        {target === 'new' || file.environments.length === 0 ? <Plus size={12} /> : <Check size={12} />}
        {target === 'new' || file.environments.length === 0 ? 'Create & add' : 'Save'}
      </button>
    </div>
  );
}

interface Props {
  status: VarStatus;
  anchor: AnchorBox;
  onClose: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export function VariablePopover({ status, anchor, onClose, onMouseEnter, onMouseLeave }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const setVariable = useEnvironmentStore((state) => state.setVariable);
  const activeEnvironmentId = useEnvironmentStore((state) => state.file.activeEnvironmentId);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(status.value ?? '');
  const width = 310;
  const left = Math.max(10, Math.min(anchor.left, window.innerWidth - width - 10));
  const estimatedHeight = status.state === 'resolved' ? 190 : 260;
  const top = anchor.bottom + 8 + estimatedHeight < window.innerHeight
    ? anchor.bottom + 8
    : Math.max(10, anchor.top - estimatedHeight - 8);

  useEffect(() => setEditValue(status.value ?? ''), [status.value]);
  useEffect(() => {
    const pointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const keyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('pointerdown', pointerDown);
    document.addEventListener('keydown', keyDown);
    return () => {
      document.removeEventListener('pointerdown', pointerDown);
      document.removeEventListener('keydown', keyDown);
    };
  }, [onClose]);

  const saveEdit = async () => {
    if (!activeEnvironmentId) return;
    await setVariable(activeEnvironmentId, status.name, editValue);
    setEditing(false);
  };

  return createPortal(
    <div ref={ref} className="variable-popover" style={{ left, top, width }} role="dialog" aria-label={`Variable ${status.name}`} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <header>
        <div><code>{`{{${status.name}}}`}</code><span className={`variable-state-label ${status.state}`}>{status.state}</span></div>
        <button aria-label="Close variable details" onClick={onClose}><X size={13} /></button>
      </header>
      {status.state === 'unresolved' ? (
        <div className="variable-popover-body">
          <p className="variable-reason">{reasonText(status)}</p>
          <QuickAddVariable name={status.name} onSaved={onClose} />
        </div>
      ) : (
        <div className="variable-popover-body">
          <span className="variable-source">From <strong>{status.envName}</strong></span>
          {editing ? (
            <div className="variable-inline-edit">
              <input autoFocus value={editValue} onChange={(event) => setEditValue(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void saveEdit(); }} />
              <button onClick={() => void saveEdit()}><Check size={12} /> Save</button>
            </div>
          ) : (
            <button className="variable-value" title="Edit value" onClick={() => setEditing(true)}>{status.value === '' ? <em>Empty value</em> : `${status.value?.slice(0, 200)}${(status.value?.length ?? 0) > 200 ? '…' : ''}`}</button>
          )}
          <button className="variable-copy" onClick={() => void navigator.clipboard.writeText(status.value ?? '')}><Copy size={12} /> Copy value</button>
        </div>
      )}
      <button className="variable-panel-link" onClick={() => { window.dispatchEvent(new Event(OPEN_VARIABLES_EVENT)); onClose(); }}>
        Variables in request <CornerDownRight size={12} />
      </button>
    </div>,
    document.body,
  );
}
