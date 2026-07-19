import { X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useEffect } from 'react';
import type { VarStatus } from '../lib/variables';
import { QuickAddVariable } from './VariablePopover';

interface Props {
  open: boolean;
  variables: VarStatus[];
  onClose: () => void;
}

export function VariablesPanel({ open, variables, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [onClose, open]);

  if (!open) return null;
  const unresolved = variables.filter((variable) => variable.state === 'unresolved').length;
  return createPortal(
    <aside className="variables-panel" aria-label="Variables in request">
      <header>
        <div><span>REQUEST SCOPE</span><h2>Variables in request</h2></div>
        <button aria-label="Close variables panel" onClick={onClose}><X size={15} /></button>
      </header>
      <div className="variables-panel-summary">
        <span>{variables.length} distinct</span>
        <span className={unresolved ? 'has-unresolved' : ''}>{unresolved ? `${unresolved} unresolved` : 'All resolved'}</span>
      </div>
      <div className="variables-panel-list">
        {variables.length === 0 ? <p className="variables-panel-empty">No <code>{'{{variables}}'}</code> in this request.</p> : variables.map((variable) => (
          <section className="variables-panel-row" key={variable.name}>
            <div className="variables-panel-row-heading">
              <i className={variable.state} />
              <code>{variable.name}</code>
              <span>{variable.envName ?? 'No environment'}</span>
            </div>
            {variable.state === 'resolved'
              ? <p className="variables-panel-value">{variable.value === '' ? <em>Empty value</em> : `${variable.value?.slice(0, 160)}${(variable.value?.length ?? 0) > 160 ? '…' : ''}`}</p>
              : <QuickAddVariable name={variable.name} compact />}
          </section>
        ))}
      </div>
    </aside>,
    document.body,
  );
}
