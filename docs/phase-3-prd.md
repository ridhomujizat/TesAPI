# GetMan — Phase 3 PRD: Collections, Workspaces & History (Local Storage)

**Status:** Draft
**Owner:** ridho
**Stack context:** Tauri 2 + React 19 + TypeScript + zustand. Sidebar currently renders hardcoded mock collections; app has a single request (no tabs); nothing persists.

---

## 1. Problem

Every request is lost on app close. The sidebar collections are fake. There is no way to save, name, organize, or reload requests. Phase 3 makes GetMan stateful: real collections with unlimited folder nesting, request tabs with explicit save, auto-recorded history — all persisted locally as JSON, designed so Git/cloud storage can plug in later without a rewrite.

## 2. Goals / Non-Goals

**Goals**

- Workspace ("workstation") concept with **local JSON storage** as the only implemented provider.
- Tabs for multiple open requests. New tabs are **never auto-saved**; user explicitly clicks **Save**. Save button disabled when no changes, enabled when dirty or tab is new.
- Collections with **unlimited nested folders**; organize via **drag-and-drop** in the sidebar (requests and folders, incl. across collections).
- Auto-save every sent request to **history**; reload any history item into a tab.
- Handle **large collections** (10k+ requests) without crashes, data loss, or UI jank.
- **Forward-compatible design** (interfaces + data shapes only, no implementation) for: multiple workspaces & switching, Git-backed workspaces with user-selected folder location, cloud storage, switching between Git/cloud providers.

**Non-Goals (this phase)**

- Implementing workspace switching UI, Git integration, cloud sync, or provider switching.
- Environment variables UI beyond basics (see FR7 — should-have, may slip to 3.5).
- Import/export of Postman collection format.

## 3. Functional Requirements

### FR1 — Workspace & storage architecture

- Single **StorageProvider** interface all persistence goes through; Phase 3 ships only `LocalJsonProvider`:

```ts
interface StorageProvider {
  loadWorkspaceMeta(): Promise<WorkspaceMeta>;
  listCollections(): Promise<CollectionSummary[]>;          // id, name, counts — no bodies
  loadCollection(id: string): Promise<Collection>;
  saveCollection(c: Collection): Promise<void>;             // atomic
  deleteCollection(id: string): Promise<void>;
  appendHistory(e: HistoryEntry): Promise<void>;
  queryHistory(q: HistoryQuery): Promise<HistoryEntry[]>;
  clearHistory(): Promise<void>;
}
```

- On-disk layout (Tauri `appDataDir`):

```
getman/
├── workspaces.json              # registry: { activeWorkspaceId, workspaces: [{id, name, storage}] }
└── workspaces/{wsId}/
    ├── workspace.json           # { schemaVersion, name, storage: { type: 'local' } }
    ├── collections/{collectionId}.json   # one file per collection
    ├── history.ndjson           # append-only, one JSON entry per line
    └── environments.json
```

- Registry ships with exactly one default workspace, but the shape already supports many. `storage.type` is `'local' | 'cloud'` (only `'local'` valid now). **Git is not a separate type — it's the next step of `'local'`**: a local workspace folder later becomes a Git repo. Reserved shape: `storage: { type: 'local', rootPath?: string, git?: { enabled: boolean } }` — `rootPath` for the future user-selected folder, `git` flag added when Git integration lands. `schemaVersion` + migration hook on load.

### FR2 — Collection & tree model

- **On disk:** nested tree (human-readable, diff-friendly for future Git):

```ts
interface Collection { id: string; name: string; schemaVersion: number; root: TreeNode[] }
type TreeNode =
  | { id: string; type: 'folder'; name: string; children: TreeNode[] }   // unlimited depth
  | { id: string; type: 'request'; name: string; request: GetmanRequest };
```

- **In memory:** normalized flat maps (`nodesById`, `childIdsByParent`) for O(1) move/rename/delete and cheap re-renders; (de)normalize at load/save boundaries.
- No depth limit, no per-folder item limit. Duplicate names allowed (ids are identity).
- CRUD: create/rename/delete collection, folder, request; delete folder = recursive with confirm; duplicate request.

### FR3 — Tabs & explicit save

- Tab bar above the request builder; each tab holds `{ id, draft: GetmanRequest, origin: { collectionId, nodeId } | null, savedSnapshot: string | null }`.
- `dirty = origin === null || normalize(draft) !== savedSnapshot` (normalization strips row ids and trailing blank rows so cosmetic state never counts as a change).
- **Save button:** disabled when `!dirty`; enabled when dirty or tab is new. `Cmd/Ctrl+S` triggers it.
  - New tab → "Save request" dialog: name + collection + folder picker (tree) → creates node, tab gains `origin`, snapshot updates.
  - Existing tab → overwrite node in place, snapshot updates, button disables.
- Opening a request from the sidebar opens a tab (focus existing tab if already open). Sending a request **never** saves it to a collection.
- Dirty indicator (dot) on tab; closing a dirty tab prompts Save / Discard / Cancel. Open tabs (ids + drafts) persist across app restarts (crash-safe session file, debounced).

### FR4 — Drag-and-drop organization

- In sidebar: drag requests and folders to reorder within a folder, move into any folder at any depth, move between collections.
- Guards: cannot drop a folder into itself/its descendants; invalid targets show no-drop cursor.
- Affordances: drop-line indicator (before/after/inside), auto-expand collapsed folder after ~600 ms hover, auto-scroll near pane edges, Esc cancels.
- Fallback: right-click → "Move to…" (tree picker) for accessibility.
- A move touching two collections saves both files; failure rolls back the in-memory move.

### FR5 — Large-collection performance & safety

- **Atomic writes:** write `*.tmp` → fsync → rename over target (Rust command). Keep one `.bak` of previous version per collection file.
- **Granular I/O:** saving touches only the affected collection file; history is append-only NDJSON (no rewrite); `listCollections` reads summaries without parsing full bodies where possible.
- **Lazy loading:** collection bodies load on first expand/open; parsing off the UI thread (Rust side or worker) for files > ~1 MB.
- **Virtualized sidebar tree** — render only visible nodes.
- **Debounce** non-explicit writes (session/UI state, 500 ms); explicit Save writes immediately.
- **Targets:** 50 collections / 10k total requests: cold start < 1.5 s, expand/search/DnD interactions < 16 ms frame budget, Save of a 5 MB collection < 300 ms without UI freeze, zero data loss on kill -9 during write (rename atomicity).
- Corrupt file on load → quarantine (`*.corrupt-{ts}`), fall back to `.bak`, surface non-blocking error; never crash the app.

### FR6 — History

- Every sent request auto-appends: `{ id, ts, method, url, status, durationMs, sizeBytes, request: GetmanRequest }`.
- History view in sidebar (already stubbed): grouped by day, newest first; click → opens as **new unsaved tab**.
- Search/filter by URL substring, method, status class (2xx/4xx/5xx…).
- Retention: keep most recent 1,000 entries (configurable constant); prune by file rotation, not full rewrite. Clear-history action with confirm.

### FR7 — Environment variables (should-have)

- `environments.json`: named sets of `{ key, value }`; active environment selector in toolbar.
- `{{var}}` substitution in URL, params, headers, body, auth at **send time and cURL export** only (stored text keeps placeholders). Unresolved `{{var}}` → warning toast, sent literally.
- If time-boxed out, ships as Phase 3.5; storage shape lands now regardless.

## 4. Future-Compatibility Requirements (design-only)

- All UI/store code depends on `StorageProvider`, never on file paths — a Git or cloud provider is a drop-in.
- `workspaces.json` registry + `activeWorkspaceId` means workspace switching is a UI task later, not a storage migration.
- **Git builds on local, not beside it:** the same `LocalJsonProvider` files become the Git working tree. Enabling Git later = init/clone a repo at the workspace root + set `storage.git.enabled` + optional user-selected `rootPath` — zero changes to how collections are read/written. `LocalJsonProvider` already resolves its root from workspace meta, so pointing it at a user-chosen folder is trivial.
- Nested-tree JSON on disk is line-diffable → Git-friendly. Stable key ordering when serializing to minimize diffs.
- Provider switching (local/Git ⇄ cloud) = re-registering a workspace with a different `storage.type`; ids are UUIDs, valid across providers.

## 5. Acceptance Criteria

1. Create collection → nested folders 10+ levels deep → add requests → restart app → everything intact.
2. New tab: Save enabled immediately; after saving, button disables; any edit re-enables it; undoing the edit back to saved state disables it again (normalized comparison).
3. New tabs never appear in any collection until Save; Send alone writes only to history.
4. Drag a request into a nested folder, a folder into another collection, and reorder siblings — all persist across restart; dropping a folder into its own child is impossible.
5. Seeded workspace with 10k requests across 50 collections meets FR5 targets; killing the app mid-save never corrupts data (worst case: last `.bak` restored).
6. Every sent request appears in history; clicking a history entry opens an unsaved tab that reproduces the exact request.
7. All persistence calls go through `StorageProvider`; grep finds no direct fs access in `src/` outside the provider module.

## 6. Open Questions

- Tab overflow behavior (scroll vs dropdown) when many tabs open — decide during UI work.
- DnD library: `@dnd-kit` vs Atlassian `pragmatic-drag-and-drop` — spike in plan step 5, pick per tree performance.
