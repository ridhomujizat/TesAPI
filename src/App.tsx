import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { Sidebar } from './components/layout/Sidebar';
import { EnvironmentEditor } from './components/environment/EnvironmentEditor';
import { RequestBuilder } from './components/request/RequestBuilder';
import { ResponseViewer } from './components/response/ResponseViewer';
import { SaveRequestModal } from './components/SaveRequestModal';
import { CloseTabDialog } from './components/CloseTabDialog';
import { CreateWorkspaceModal } from './components/workspace/CreateWorkspaceModal';
import { WorkspaceSwitchDialog } from './components/workspace/WorkspaceSwitchDialog';
import { Toast, type ToastMessage } from './components/Toast';
import { useRequestStore } from './store/requestStore';
import { useCollectionStore } from './store/collectionStore';
import { activeVariables } from './store/environmentStore';
import { sendRequest, friendlyError } from './lib/http';
import { isTabDirty, normalizeForCompare } from './lib/collections';
import { uid } from './lib/id';
import { resolveRequest } from './lib/environments';
import { onStorageWarning, storageProvider } from './lib/storage/localJson';
import { currentSession } from './lib/workspaces/lifecycle';
import { useWorkspaceController } from './hooks/useWorkspaceController';
import type { HistoryEntry, SessionState, WorkspaceRecord } from './types';
import { OPEN_VARIABLES_EVENT } from './components/VariablePopover';

function validUrl(url: string): boolean {
  try {
    const parsed = new URL(url.includes('://') ? url : `http://${url}`);
    return !!parsed.hostname;
  } catch {
    return false;
  }
}

function EmptyRequestState({ onNewRequest }: { onNewRequest: () => void }) {
  return (
    <section className="empty-request-state">
      <div className="empty-request-content">
        <span className="empty-request-label">No request selected</span>
        <button className="empty-request-primary" onClick={onNewRequest}><Plus size={12} /> New request</button>
      </div>
    </section>
  );
}

export default function App() {
  const { request, tabs, activeTabId, loading, setLoading, setResponse, setError, closeTab, createRequest, markSaved } = useRequestStore();
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [closeTabId, setCloseTabId] = useState<string | null>(null);
  const [closeAfterSave, setCloseAfterSave] = useState<string | null>(null);
  const [workspaceView, setWorkspaceView] = useState<'api' | 'environment'>('api');
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const [switchTarget, setSwitchTarget] = useState<WorkspaceRecord | null>(null);
  const [switchSaving, setSwitchSaving] = useState(false);
  const [saveForWorkspaceSwitch, setSaveForWorkspaceSwitch] = useState(false);
  const inflight = useRef<string | null>(null);
  const sessionTimer = useRef(0);
  const hasActiveTab = tabs.some((tab) => tab.id === activeTabId);

  const showToast = useCallback((message: ToastMessage) => setToast(message), []);
  const workspace = useWorkspaceController(showToast);

  useEffect(() => onStorageWarning((message) => showToast({ title: 'Storage warning', detail: message, tone: 'error' })), [showToast]);

  useEffect(() => {
    if (!workspace.ready || !workspace.current) return;
    const save = () => {
      window.clearTimeout(sessionTimer.current);
      sessionTimer.current = window.setTimeout(() => {
        void storageProvider.saveSession(currentSession()).catch((error) => showToast({ title: 'Could not save session', detail: String(error), tone: 'error' }));
      }, 500);
    };
    const unsubscribeTabs = useRequestStore.subscribe(save);
    const unsubscribeCollections = useCollectionStore.subscribe(save);
    save();
    return () => { window.clearTimeout(sessionTimer.current); unsubscribeTabs(); unsubscribeCollections(); };
  }, [showToast, workspace.current?.id, workspace.ready]);

  const appendHistory = useCallback((entry: HistoryEntry) => {
    void storageProvider.appendHistory(entry)
      .then(() => window.dispatchEvent(new Event('tesapi-history-updated')))
      .catch((error) => showToast({ title: 'Could not save history', detail: String(error), tone: 'error' }));
  }, [showToast]);

  const onSend = useCallback(async () => {
    const resolved = resolveRequest(request, activeVariables());
    if (resolved.unresolved.length) showToast({
      title: 'Unresolved environment variables',
      detail: resolved.unresolved.join(', '),
      tone: 'error',
      actionLabel: 'Fix',
      onAction: () => window.dispatchEvent(new Event(OPEN_VARIABLES_EVENT)),
    });
    const url = resolved.request.url.trim();
    if (!validUrl(url)) {
      setResponse(null);
      setError('Invalid URL — check the address and try again.');
      return;
    }
    const normalized = url.includes('://') ? url : `https://${url}`;
    const sentRequest = { ...resolved.request, url: normalized };
    const token = uid();
    const started = Date.now();
    inflight.current = token;
    setError(null);
    setResponse(null);
    setLoading(true);
    try {
      const response = await sendRequest(sentRequest);
      appendHistory({ id: uid(), ts: new Date().toISOString(), method: sentRequest.method, url: sentRequest.url, status: response.status, durationMs: response.timeMs, sizeBytes: response.sizeBytes, request });
      if (inflight.current === token) setResponse(response);
    } catch (error) {
      appendHistory({ id: uid(), ts: new Date().toISOString(), method: sentRequest.method, url: sentRequest.url, status: 0, durationMs: Date.now() - started, sizeBytes: 0, request });
      if (inflight.current === token) setError(friendlyError(error));
    } finally {
      if (inflight.current === token) setLoading(false);
    }
  }, [appendHistory, request, setError, setLoading, setResponse, showToast]);

  const onCancel = useCallback(() => {
    inflight.current = null;
    setLoading(false);
  }, [setLoading]);

  const openNewRequest = useCallback(() => {
    createRequest();
    setWorkspaceView('api');
  }, [createRequest]);

  const saveExisting = useCallback(async (tabId = activeTabId, notify = true) => {
    const state = useRequestStore.getState();
    const tab = state.tabs.find((item) => item.id === tabId);
    if (!tab?.origin) return false;
    const collections = useCollectionStore.getState();
    await collections.loadCollection(tab.origin.collectionId);
    const collection = useCollectionStore.getState().collectionsById[tab.origin.collectionId];
    const node = collection?.nodesById[tab.origin.nodeId];
    if (!node || node.type !== 'request') throw new Error('Saved request no longer exists.');
    await useCollectionStore.getState().saveRequest(tab.origin.collectionId, node.parentId, tab.draft.name || node.name, tab.draft, tab.origin.nodeId);
    if (state.activeTabId === tabId) state.markSaved(tab.origin, tab.draft.name || node.name);
    else useRequestStore.setState((current) => ({ tabs: current.tabs.map((item) => item.id === tabId ? { ...item, savedSnapshot: normalizeForCompare(tab.draft) } : item) }));
    if (notify) showToast({ title: 'Request saved' });
    return true;
  }, [activeTabId, showToast]);

  const switchSession = useCallback((discard: boolean): SessionState => {
    const session = currentSession();
    if (!discard) return session;
    const tabs = session.tabs.filter((tab) => !isTabDirty(tab));
    return { ...session, tabs, activeTabId: tabs.some((tab) => tab.id === session.activeTabId) ? session.activeTabId : tabs[0]?.id ?? '' };
  }, []);

  const performWorkspaceSwitch = useCallback(async (target: WorkspaceRecord, discard = false) => {
    setSwitchSaving(true);
    window.clearTimeout(sessionTimer.current);
    try {
      await workspace.replace(target, switchSession(discard));
      setWorkspaceView('api');
      setSwitchTarget(null);
    } catch (error) {
      showToast({ title: 'Could not switch workspace', detail: String(error), tone: 'error' });
    } finally {
      setSwitchSaving(false);
    }
  }, [showToast, switchSession, workspace]);

  const requestWorkspaceSwitch = useCallback((target: WorkspaceRecord) => {
    if (target.id === workspace.current?.id) return;
    if (useRequestStore.getState().tabs.some(isTabDirty)) setSwitchTarget(target);
    else void performWorkspaceSwitch(target);
  }, [performWorkspaceSwitch, workspace.current?.id]);

  const saveAllForWorkspaceSwitch = useCallback(async () => {
    if (!switchTarget) return;
    setSwitchSaving(true);
    try {
      for (const tab of useRequestStore.getState().tabs.filter((item) => item.origin && isTabDirty(item))) await saveExisting(tab.id, false);
      const unsaved = useRequestStore.getState().tabs.find((tab) => !tab.origin && isTabDirty(tab));
      if (unsaved) {
        useRequestStore.getState().focusTab(unsaved.id);
        setSaveForWorkspaceSwitch(true);
        setSaveOpen(true);
        return;
      }
      await performWorkspaceSwitch(switchTarget);
    } catch (error) {
      showToast({ title: 'Could not save all requests', detail: String(error), tone: 'error' });
    } finally {
      setSwitchSaving(false);
    }
  }, [performWorkspaceSwitch, saveExisting, showToast, switchTarget]);

  const onSave = useCallback(() => {
    const tab = useRequestStore.getState().tabs.find((item) => item.id === useRequestStore.getState().activeTabId);
    if (!tab || !isTabDirty(tab)) return;
    if (!tab.origin) {
      setSaveOpen(true);
      return;
    }
    void saveExisting().catch((error) => showToast({ title: 'Could not save request', detail: String(error), tone: 'error' }));
  }, [saveExisting, showToast]);

  const requestClose = useCallback((id: string) => {
    const tab = useRequestStore.getState().tabs.find((item) => item.id === id);
    if (!tab) return;
    if (isTabDirty(tab)) setCloseTabId(id);
    else closeTab(id);
  }, [closeTab]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        if (workspaceView === 'api' && hasActiveTab && !loading) void onSend();
      } else if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (workspaceView === 'api') onSave();
      } else if (event.key.toLowerCase() === 't') {
        event.preventDefault();
        openNewRequest();
      } else if (event.key.toLowerCase() === 'w') {
        event.preventDefault();
        if (workspaceView === 'api' && hasActiveTab) requestClose(activeTabId);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeTabId, hasActiveTab, loading, onSave, onSend, openNewRequest, requestClose, workspaceView]);

  const closingTab = tabs.find((tab) => tab.id === closeTabId);

  if (!workspace.current) return <div className="shell workspace-loading"><span className="spinner accent-spinner" /></div>;

  return (
    <div className="shell">
      <Sidebar currentWorkspace={workspace.current} workspaces={workspace.workspaces} onToast={showToast} onWorkspaceChange={setWorkspaceView} onCreateWorkspace={() => setCreateWorkspaceOpen(true)} onOpenWorkspace={requestWorkspaceSwitch} onOpenWorkspaceWindow={(target) => void workspace.openNewWindow(target).catch((error) => showToast({ title: 'Could not open workspace window', detail: String(error), tone: 'error' }))} onRenameWorkspace={(id, name) => workspace.rename(id, name).catch((error) => { showToast({ title: 'Could not rename workspace', detail: String(error), tone: 'error' }); })} />
      <main className={workspaceView === 'environment' ? 'main environment-main' : `main${hasActiveTab ? '' : ' empty-request-main'}`}>
        {workspaceView === 'environment' ? <EnvironmentEditor onToast={showToast} /> : hasActiveTab ? <>
          <RequestBuilder onSend={onSend} onCancel={onCancel} onToast={showToast} onSave={onSave} onCloseTab={requestClose} />
          <ResponseViewer onRetry={onSend} />
        </> : <EmptyRequestState onNewRequest={openNewRequest} />}
      </main>
      <SaveRequestModal
        open={saveOpen}
        request={request}
        onCancel={() => { setSaveOpen(false); setCloseAfterSave(null); if (saveForWorkspaceSwitch) { setSaveForWorkspaceSwitch(false); setSwitchTarget(null); } }}
        onError={(detail) => showToast({ title: 'Could not save request', detail, tone: 'error' })}
        onSaved={(origin, name) => {
          markSaved(origin, name);
          setSaveOpen(false);
          showToast({ title: 'Saved to collection' });
          if (closeAfterSave) closeTab(closeAfterSave);
          setCloseAfterSave(null);
          if (saveForWorkspaceSwitch) {
            setSaveForWorkspaceSwitch(false);
            window.queueMicrotask(() => { void saveAllForWorkspaceSwitch(); });
          }
        }}
      />
      <CloseTabDialog
        open={!!closingTab}
        name={closingTab?.draft.name || 'Untitled request'}
        onCancel={() => setCloseTabId(null)}
        onDiscard={() => { if (closeTabId) closeTab(closeTabId); setCloseTabId(null); }}
        onSave={() => {
          if (!closingTab) return;
          setCloseTabId(null);
          if (!closingTab.origin) {
            useRequestStore.getState().focusTab(closingTab.id);
            setCloseAfterSave(closingTab.id);
            setSaveOpen(true);
          } else {
            void saveExisting(closingTab.id).then(() => closeTab(closingTab.id)).catch((error) => showToast({ title: 'Could not save request', detail: String(error), tone: 'error' }));
          }
        }}
      />
      <CreateWorkspaceModal open={createWorkspaceOpen} onCancel={() => setCreateWorkspaceOpen(false)} onCreate={workspace.create} onCreated={(created) => { setCreateWorkspaceOpen(false); requestWorkspaceSwitch(created); }} />
      <WorkspaceSwitchDialog open={!!switchTarget && !saveForWorkspaceSwitch} workspaceName={switchTarget?.name ?? ''} saving={switchSaving} onCancel={() => setSwitchTarget(null)} onDiscard={() => { if (switchTarget) void performWorkspaceSwitch(switchTarget, true); }} onSaveAll={() => void saveAllForWorkspaceSwitch()} />
      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}
