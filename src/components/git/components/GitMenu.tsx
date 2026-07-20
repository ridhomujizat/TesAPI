import { useEffect, useRef, useState } from 'react';
import { Check, ChevronRight, GitBranch, Globe, History, Plus, RotateCcw, Settings2, Upload, Download } from 'lucide-react';
import type { WorkspaceRecord } from '../../../types';
import type { ToastMessage } from '../../Toast';
import { getSetting, setSetting } from '../../../lib/registry';
import { useGitStore } from '../../../store/gitStore';
import { storageProvider } from '../../../lib/storage/localJson';
import { rehydrateWorkspaceStores } from '../../../lib/workspaces/lifecycle';
import { useRequestStore } from '../../../store/requestStore';
import { isTabDirty } from '../../../lib/collections';
import { CommitSheet } from './CommitSheet';
import { GitHistoryDialog } from './GitHistoryDialog';
import { GitRemoteDialog } from './GitRemoteDialog';

interface Props { open: boolean; onClose: () => void; workspace: WorkspaceRecord; onToast: (message: ToastMessage) => void }

export function GitMenu({ open, onClose, workspace, onToast }: Props) {
  const git = useGitStore();
  const [commitOpen, setCommitOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [remoteOpen, setRemoteOpen] = useState(false);
  const [autoCommit, setAutoCommit] = useState(false);
  const [branchesOpen, setBranchesOpen] = useState(false);
  const [branchActions, setBranchActions] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [newBranchName, setNewBranchName] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const store = useGitStore.getState();
    store.refresh().catch((error) => onToast({ title: 'Could not read Git status', detail: String(error), tone: 'error' }));
    store.loadBranches().catch(() => undefined); store.loadRemote().catch(() => undefined);
    void getSetting<boolean>(`workspace:${workspace.id}:autoCommitOnSave`).then((value) => setAutoCommit(value === true));
    const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) onClose(); };
    setActiveIndex(0); window.addEventListener('mousedown', close); return () => window.removeEventListener('mousedown', close);
  }, [onClose, onToast, open, workspace.id]);

  useEffect(() => {
    if (!open) return;
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { onClose(); return; }
      const buttons = [...(root.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
      if (!buttons.length) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); const next = (activeIndex + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length; setActiveIndex(next); buttons[next]?.focus(); }
      if (event.key === 'Enter' && document.activeElement === document.body) { event.preventDefault(); buttons[activeIndex]?.click(); }
    };
    window.addEventListener('keydown', keydown); return () => window.removeEventListener('keydown', keydown);
  }, [activeIndex, onClose, open]);

  const action = async (name: string, run: () => Promise<void>, close = true) => {
    try { await run(); if (close) onClose(); onToast({ title: name }); }
    catch (error) { onToast({ title: `${name} failed`, detail: String(error), tone: 'error' }); }
  };
  const mutate = async (operation: () => Promise<void>, allowDirtyGit = false) => {
    if (useRequestStore.getState().tabs.some(isTabDirty)) throw new Error('Save or close edited tabs before replacing workspace files.');
    if (!allowDirtyGit && git.entities.length) throw new Error('Commit or reset Git changes before switching branches.');
    await storageProvider.flush(); await operation(); await rehydrateWorkspaceStores(workspace);
  };
  const createBranch = () => { const name = newBranchName?.trim(); if (!name) return; void action('Branch created', () => mutate(() => git.createBranch(name))).then(() => setNewBranchName(null)); };
  const reset = () => {
    if (!git.entities.length || !window.confirm(`Reset ${git.entities.length} change${git.entities.length === 1 ? '' : 's'}?`)) return;
    if (!window.confirm('This permanently discards local changes. Continue?')) return;
    void action('Changes reset', () => mutate(git.reset, true));
  };
  const toggleAutoCommit = () => { const next = !autoCommit; setAutoCommit(next); storageProvider.enableGitSync(next); void setSetting(`workspace:${workspace.id}:autoCommitOnSave`, next).then(() => onToast({ title: next ? 'Auto-commit enabled' : 'Manual commits enabled' })).catch((error) => onToast({ title: 'Could not update Git setting', detail: String(error), tone: 'error' })); };

  return <>
    {open && <div ref={root} className="git-menu-popover" role="menu">
      <button onClick={() => { onClose(); setHistoryOpen(true); void git.loadHistory(); }}><History size={13} />View History…</button>
      <button onClick={() => { onClose(); setRemoteOpen(true); }}><Globe size={13} />Manage Remotes…</button>
      <i className="git-menu-divider" />
      {newBranchName == null ? <button onClick={() => setNewBranchName('')}><Plus size={13} />New Branch…</button> : <div className="git-new-branch"><GitBranch size={12} /><input autoFocus value={newBranchName} placeholder="feature/name" onChange={(event) => setNewBranchName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') createBranch(); if (event.key === 'Escape') setNewBranchName(null); }} /><button disabled={!newBranchName.trim()} onClick={createBranch}><Check size={12} /></button></div>}
      <i className="git-menu-divider" />
      <button disabled={!git.status?.hasRemote || git.status.ahead === 0 || !!git.inFlight} onClick={() => void action('Changes pushed', git.push)}><Upload size={13} />Push{git.status?.ahead ? <small>{git.status.ahead}</small> : null}</button>
      <button disabled={!git.status?.hasRemote || !!git.inFlight} onClick={() => void action('Workspace pulled', () => mutate(() => git.pull(git.status?.branch ?? workspace.gitBranch ?? 'main').then(() => undefined), true))}><Download size={13} />Pull{git.status?.behind ? <small>{git.status.behind}</small> : null}</button>
      <button disabled={!git.entities.length} onClick={() => { onClose(); setCommitOpen(true); }}><GitBranch size={13} />Commit…</button>
      <button className="danger" disabled={!git.entities.length} onClick={reset}><RotateCcw size={13} />Reset Changes</button>
      <i className="git-menu-divider" />
      <button className="git-menu-section" onClick={() => setBranchesOpen((value) => !value)}>BRANCHES <ChevronRight size={12} className={branchesOpen ? 'rotate-90' : ''} /></button>
      {branchesOpen && <div className="git-branch-list">{git.branches.map((branch) => <div className="git-branch-item" key={branch.name}><div className="git-branch-row"><button onClick={() => branch.current ? undefined : void action(`Switched to ${branch.name}`, () => mutate(() => git.checkout(branch.name)))}><span className="git-branch-name">{branch.name}</span>{branch.current && <Check size={13} />}</button><button className="git-branch-more" title="Branch actions" onClick={() => setBranchActions((current) => current === branch.name ? null : branch.name)}><ChevronRight className={branchActions === branch.name ? 'rotate-90' : ''} size={12} /></button></div>{branchActions === branch.name && <div className="git-branch-actions"><button disabled={branch.current} onClick={() => void action(`Switched to ${branch.name}`, () => mutate(() => git.checkout(branch.name)))}>Checkout</button><button onClick={() => { const next = window.prompt(`Rename ${branch.name} to`, branch.name); if (next?.trim() && next !== branch.name) void action('Branch renamed', () => git.renameBranch(branch.name, next.trim())); }}>Rename…</button><button className="danger" disabled={branch.current} onClick={() => { if (window.confirm(`Delete branch ${branch.name}?`)) void action('Branch deleted', () => git.deleteBranch(branch.name)); }}>Delete…</button></div>}</div>)}</div>}
      <i className="git-menu-divider" />
      <button className="git-menu-setting" onClick={toggleAutoCommit}><span><Settings2 size={13} />Auto-commit on save</span>{autoCommit ? <Check size={13} /> : null}</button>
    </div>}
    {commitOpen && <CommitSheet workspace={workspace} onClose={() => setCommitOpen(false)} onToast={onToast} />}
    {historyOpen && <GitHistoryDialog entries={git.history} onClose={() => setHistoryOpen(false)} />}
    {remoteOpen && <GitRemoteDialog workspace={workspace} onClose={() => setRemoteOpen(false)} onToast={onToast} />}
  </>;
}
