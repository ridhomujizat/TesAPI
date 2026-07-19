import { useState } from 'react';
import { CollectionsSidebar } from './sidebar/CollectionsSidebar';
import { EnvironmentSidebar } from './sidebar/EnvironmentSidebar';
import { HistorySidebar } from './sidebar/HistorySidebar';
import type { ToastMessage } from '../Toast';
import type { SidebarView, WorkspaceView } from './sidebar/types';

export type { WorkspaceView } from './sidebar/types';

export function Sidebar({ onToast, onWorkspaceChange }: { onToast: (message: ToastMessage) => void; onWorkspaceChange: (view: WorkspaceView) => void }) {
  const [view, setView] = useState<SidebarView>('collections');

  const changeView = (next: SidebarView) => {
    setView(next);
    onWorkspaceChange(next === 'environments' ? 'environment' : 'api');
  };

  return <aside className="sidebar" onContextMenu={(event) => event.preventDefault()}>
    {view === 'collections' && <CollectionsSidebar onToast={onToast} onViewChange={changeView} onWorkspaceChange={onWorkspaceChange} />}
    {view === 'history' && <HistorySidebar onToast={onToast} onViewChange={changeView} />}
    {view === 'environments' && <EnvironmentSidebar onToast={onToast} onViewChange={changeView} onWorkspaceChange={onWorkspaceChange} />}
  </aside>;
}
