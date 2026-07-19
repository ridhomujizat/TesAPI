import { useState } from 'react';
import { CollectionsSidebar } from './sidebar/CollectionsSidebar';
import { EnvironmentSidebar } from './sidebar/EnvironmentSidebar';
import { HistorySidebar } from './sidebar/HistorySidebar';
import type { ToastMessage } from '../Toast';
import type { SidebarView, WorkspaceView } from './sidebar/types';
import type { WorkspaceRecord } from '../../types';
import { WorkspaceSwitcher } from '../workspace/WorkspaceSwitcher';

export type { WorkspaceView } from './sidebar/types';

interface Props {
  currentWorkspace: WorkspaceRecord;
  workspaces: WorkspaceRecord[];
  onToast: (message: ToastMessage) => void;
  onWorkspaceChange: (view: WorkspaceView) => void;
  onCreateWorkspace: () => void;
  onOpenWorkspace: (workspace: WorkspaceRecord) => void;
  onOpenWorkspaceWindow: (workspace: WorkspaceRecord) => void;
  onRenameWorkspace: (id: string, name: string) => Promise<void>;
}

export function Sidebar({ currentWorkspace, workspaces, onToast, onWorkspaceChange, onCreateWorkspace, onOpenWorkspace, onOpenWorkspaceWindow, onRenameWorkspace }: Props) {
  const [view, setView] = useState<SidebarView>('collections');

  const changeView = (next: SidebarView) => {
    setView(next);
    onWorkspaceChange(next === 'environments' ? 'environment' : 'api');
  };

  return <aside className="sidebar" onContextMenu={(event) => event.preventDefault()}>
    <WorkspaceSwitcher current={currentWorkspace} workspaces={workspaces} onCreate={onCreateWorkspace} onOpenHere={onOpenWorkspace} onOpenWindow={onOpenWorkspaceWindow} onRename={onRenameWorkspace} />
    {view === 'collections' && <CollectionsSidebar onToast={onToast} onViewChange={changeView} onWorkspaceChange={onWorkspaceChange} />}
    {view === 'history' && <HistorySidebar onToast={onToast} onViewChange={changeView} />}
    {view === 'environments' && <EnvironmentSidebar onToast={onToast} onViewChange={changeView} onWorkspaceChange={onWorkspaceChange} />}
  </aside>;
}
