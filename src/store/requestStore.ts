import { create } from 'zustand';
import type { GetmanRequest, GetmanResponse, KeyValue, Method, RequestOrigin, RequestTab, SessionState } from '../types/index.ts';
import { normalizeForCompare } from '../lib/collections.ts';
import { buildUrl, emptyRow, parseParams, withTrailingBlank } from '../lib/params.ts';
import { uid } from '../lib/id.ts';

export function newRequest(): GetmanRequest {
  return {
    id: uid(),
    method: 'GET',
    url: '',
    params: [emptyRow()],
    headers: [emptyRow()],
    body: { type: 'none', raw: '', formData: [emptyRow()] },
    auth: { type: 'none' },
  };
}

function newTab(request = newRequest(), origin: RequestOrigin | null = null): RequestTab {
  return {
    id: uid(),
    draft: request,
    origin,
    savedSnapshot: origin ? normalizeForCompare(request) : null,
  };
}

interface State {
  tabs: RequestTab[];
  activeTabId: string;
  request: GetmanRequest;
  response: GetmanResponse | null;
  error: string | null;
  loading: boolean;
  setMethod: (method: Method) => void;
  setUrl: (url: string) => void;
  setParams: (params: KeyValue[]) => void;
  setHeaders: (headers: KeyValue[]) => void;
  setBody: (body: GetmanRequest['body']) => void;
  setAuth: (auth: GetmanRequest['auth']) => void;
  setResponse: (response: GetmanResponse | null) => void;
  setError: (error: string | null) => void;
  setLoading: (loading: boolean) => void;
  replaceRequest: (request: GetmanRequest) => void;
  createRequest: () => void;
  openRequest: (request: GetmanRequest, origin: RequestOrigin) => void;
  openUnsaved: (request: GetmanRequest) => void;
  focusTab: (id: string) => void;
  closeTab: (id: string) => void;
  markSaved: (origin: RequestOrigin, name: string) => void;
  restoreSession: (session: SessionState) => void;
}

const initialTab = newTab();

function updateActive(state: State, draft: GetmanRequest): Partial<State> {
  return {
    request: draft,
    tabs: state.tabs.map((tab) => tab.id === state.activeTabId ? { ...tab, draft } : tab),
  };
}

export const useRequestStore = create<State>((set, get) => ({
  tabs: [initialTab],
  activeTabId: initialTab.id,
  request: initialTab.draft,
  response: null,
  error: null,
  loading: false,
  setMethod: (method) => set((state) => updateActive(state, { ...state.request, method })),
  setUrl: (url) => set((state) => updateActive(state, { ...state.request, url, params: parseParams(url) })),
  setParams: (params) => set((state) => {
    const rows = withTrailingBlank(params);
    return updateActive(state, { ...state.request, params: rows, url: buildUrl(state.request.url, rows) });
  }),
  setHeaders: (headers) => set((state) => updateActive(state, { ...state.request, headers: withTrailingBlank(headers) })),
  setBody: (body) => set((state) => updateActive(state, {
    ...state.request,
    body: body.type === 'form-data' ? { ...body, formData: withTrailingBlank(body.formData ?? []) } : body,
  })),
  setAuth: (auth) => set((state) => updateActive(state, { ...state.request, auth })),
  setResponse: (response) => set({ response }),
  setError: (error) => set({ error }),
  setLoading: (loading) => set({ loading }),
  replaceRequest: (request) => set((state) => ({ ...updateActive(state, request), response: null, error: null })),
  createRequest: () => {
    const tab = newTab();
    set((state) => ({ tabs: [...state.tabs, tab], activeTabId: tab.id, request: tab.draft, response: null, error: null }));
  },
  openRequest: (request, origin) => {
    const existing = get().tabs.find((tab) => tab.origin?.collectionId === origin.collectionId && tab.origin.nodeId === origin.nodeId);
    if (existing) {
      get().focusTab(existing.id);
      return;
    }
    const tab = newTab(request, origin);
    set((state) => ({ tabs: [...state.tabs, tab], activeTabId: tab.id, request: tab.draft, response: null, error: null }));
  },
  openUnsaved: (request) => {
    const tab = newTab({ ...request, id: uid() });
    set((state) => ({ tabs: [...state.tabs, tab], activeTabId: tab.id, request: tab.draft, response: null, error: null }));
  },
  focusTab: (id) => {
    const tab = get().tabs.find((item) => item.id === id);
    if (tab) set({ activeTabId: id, request: tab.draft, response: null, error: null, loading: false });
  },
  closeTab: (id) => set((state) => {
    const index = state.tabs.findIndex((tab) => tab.id === id);
    if (index < 0) return state;
    const remaining = state.tabs.filter((tab) => tab.id !== id);
    if (!remaining.length) {
      const tab = newTab();
      return { tabs: [tab], activeTabId: tab.id, request: tab.draft, response: null, error: null, loading: false };
    }
    if (state.activeTabId !== id) return { tabs: remaining };
    const next = remaining[Math.min(index, remaining.length - 1)];
    return { tabs: remaining, activeTabId: next.id, request: next.draft, response: null, error: null, loading: false };
  }),
  markSaved: (origin, name) => set((state) => {
    const draft = { ...state.request, name };
    const snapshot = normalizeForCompare(draft);
    return {
      request: draft,
      tabs: state.tabs.map((tab) => tab.id === state.activeTabId ? { ...tab, draft, origin, savedSnapshot: snapshot } : tab),
    };
  }),
  restoreSession: (session) => {
    const tabs = session.tabs?.length ? session.tabs : [newTab()];
    const active = tabs.find((tab) => tab.id === session.activeTabId) ?? tabs[0];
    set({ tabs, activeTabId: active.id, request: active.draft, response: null, error: null, loading: false });
  },
}));
