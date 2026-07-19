import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { useEnvironmentStore } from '../../../store/environmentStore';
import type { ToastMessage } from '../../Toast';
import { SidebarNav } from './SidebarNav';
import { SidebarSearch } from './SidebarSearch';
import type { SidebarView, WorkspaceView } from './types';

interface ContextState { x: number; y: number; environmentId?: string }

interface Props {
  onToast: (message: ToastMessage) => void;
  onViewChange: (view: SidebarView) => void;
  onWorkspaceChange: (view: WorkspaceView) => void;
}

export function EnvironmentSidebar({ onToast, onViewChange, onWorkspaceChange }: Props) {
  const file = useEnvironmentStore((state) => state.file);
  const selectedEnvironmentId = useEnvironmentStore((state) => state.selectedEnvironmentId);
  const createEnvironment = useEnvironmentStore((state) => state.createEnvironment);
  const duplicateEnvironment = useEnvironmentStore((state) => state.duplicateEnvironment);
  const renameEnvironment = useEnvironmentStore((state) => state.renameEnvironment);
  const deleteEnvironment = useEnvironmentStore((state) => state.deleteEnvironment);
  const selectEnvironment = useEnvironmentStore((state) => state.selectEnvironment);
  const setActive = useEnvironmentStore((state) => state.setActive);
  const [query, setQuery] = useState('');
  const [context, setContext] = useState<ContextState | null>(null);
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const environments = file.environments.filter((environment) => environment.name.toLowerCase().includes(query.trim().toLowerCase()));

  useEffect(() => {
    const close = () => setContext(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const create = async () => {
    try {
      const id = await createEnvironment('New environment', undefined, false);
      setEditing({ id, value: 'New environment' });
      onWorkspaceChange('environment');
    } catch (error) {
      onToast({ title: 'Could not create environment', detail: String(error), tone: 'error' });
    }
  };

  const commitName = async () => {
    const target = editing;
    if (!target) return;
    setEditing(null);
    try {
      await renameEnvironment(target.id, target.value);
    } catch (error) {
      onToast({ title: 'Could not rename environment', detail: String(error), tone: 'error' });
    }
  };

  const runAction = async (action: 'new' | 'use' | 'rename' | 'duplicate' | 'delete') => {
    const environment = file.environments.find((item) => item.id === context?.environmentId);
    setContext(null);
    if (action === 'new') return create();
    if (!environment) return;
    if (action === 'use') {
      selectEnvironment(environment.id);
      await setActive(environment.id);
    } else if (action === 'rename') {
      setEditing({ id: environment.id, value: environment.name });
    } else if (action === 'duplicate') {
      const id = await duplicateEnvironment(environment.id);
      const duplicate = useEnvironmentStore.getState().file.environments.find((item) => item.id === id);
      if (duplicate) setEditing({ id, value: duplicate.name });
    } else {
      setDeleteTarget({ id: environment.id, name: environment.name });
    }
  };

  const requestAction = (action: 'new' | 'use' | 'rename' | 'duplicate' | 'delete') => {
    void runAction(action).catch((error) => onToast({ title: 'Environment action failed', detail: String(error), tone: 'error' }));
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteEnvironment(deleteTarget.id);
      setDeleteTarget(null);
      onToast({ title: 'Environment deleted' });
    } catch (error) {
      onToast({ title: 'Could not delete environment', detail: String(error), tone: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  return <>
    <SidebarNav active="environments" onChange={onViewChange} action={<button className="icon-button sidebar-add" title="New environment" onClick={() => void create()}><Plus size={15} /></button>} />
    <SidebarSearch placeholder="Search environments" value={query} onChange={setQuery} />
    <div className="tree environment-list" onContextMenu={(event) => { event.preventDefault(); setContext({ x: event.clientX, y: event.clientY }); }}>
      {environments.map((environment) => { const active = environment.id === file.activeEnvironmentId; const isEditing = editing?.id === environment.id; const variableCount = environment.variables.filter((variable) => variable.key.trim()).length; const select = () => { if (!isEditing) selectEnvironment(environment.id); }; return <div className={`environment-list-row${selectedEnvironmentId === environment.id ? ' selected' : ''}`} key={environment.id} role="button" tabIndex={0} onClick={select} onKeyDown={(event) => { if (event.key === 'Enter') select(); }} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); setContext({ x: event.clientX, y: event.clientY, environmentId: environment.id }); }}><i className={active ? 'online' : ''} />{isEditing ? <input className="tree-rename-input" autoFocus value={editing.value} onClick={(event) => event.stopPropagation()} onChange={(event) => setEditing({ id: environment.id, value: event.target.value })} onFocus={(event) => event.currentTarget.select()} onBlur={() => void commitName()} onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') setEditing(null); }} /> : <span>{environment.name}</span>}<small>{variableCount}</small></div>; })}
      {!environments.length && <div className="sidebar-empty"><span>{query ? 'No matching environments' : 'No environments yet'}</span>{!query && <button onClick={() => void create()}>New environment</button>}</div>}
    </div>
    {context && <div className="context-menu" style={{ left: context.x, top: context.y }} onClick={(event) => event.stopPropagation()}><button onClick={() => requestAction('new')}>New Environment</button>{context.environmentId && <><button disabled={context.environmentId === file.activeEnvironmentId} onClick={() => requestAction('use')}>Use Environment</button><button onClick={() => requestAction('rename')}>Rename Environment</button><button onClick={() => requestAction('duplicate')}>Duplicate Environment</button><button className="danger" onClick={() => requestAction('delete')}>Delete Environment</button></>}</div>}
    {deleteTarget && <div className="modal-backdrop"><section className="close-tab-modal delete-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-environment-title"><div className="save-modal-header"><div><h2 id="delete-environment-title">Delete environment?</h2><p>“{deleteTarget.name}” and all of its variables will be permanently deleted.</p></div></div><div className="save-modal-actions"><button className="modal-cancel" disabled={deleting} onClick={() => setDeleteTarget(null)}>Cancel</button><button className="modal-delete" disabled={deleting} onClick={() => void confirmDelete()}>{deleting ? 'Deleting…' : 'Delete'}</button></div></section></div>}
  </>;
}
