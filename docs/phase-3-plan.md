# GetMan — Phase 3 Plan: Collections, Workspaces & History (Local Storage)

**Goal:** Real persistence — tabs with explicit save, collections with unlimited nested folders + drag-and-drop, auto-history. Local JSON only; Git/cloud remain interface-ready.
**Duration:** ~1.5–2 weeks
**PRD:** `docs/phase-3-prd.md`

---

## 1. Storage Foundation (Rust + provider)

```
src-tauri/src/
├── storage.rs        # commands: read_json, atomic_write_json, append_line,
│                     # read_last_lines, list_dir, ensure_dirs
src/lib/storage/
├── provider.ts       # StorageProvider interface (PRD FR1)
├── localJson.ts      # LocalJsonProvider — only implementation this phase
├── paths.ts          # workspace-root resolution from workspace meta
├── migrate.ts        # schemaVersion checks + migration hooks (v1 no-op)
└── __tests__/
```

- [x] Rust `atomic_write_json`: tmp file → fsync → rename; keep previous as `.bak`
- [x] Rust `append_line` (history NDJSON) + `read_last_lines(n)` for capped reads
- [x] First-run bootstrap: create dirs, `workspaces.json` with one default local workspace, empty `workspace.json`
- [x] Corrupt-file handling: rename to `*.corrupt-{ts}`, load `.bak`, surface toast (PRD FR5)
- [ ] Unit tests: atomic write survives simulated crash (tmp exists, target intact), bootstrap, migration hook

## 2. Data Model & Collection Store

- [x] Types: `WorkspaceMeta`, `Collection`, `TreeNode` (folder|request), `CollectionSummary`, `HistoryEntry` (PRD FR1–FR2) in `src/types/`
- [x] `collectionStore` (zustand): normalized in-memory shape — `nodesById`, `childIdsByParent`, `collectionsById`; (de)normalize helpers tree ⇄ flat with unit tests (round-trip property test)
- [x] CRUD actions: create/rename/delete collection, folder, request; recursive delete; duplicate request; every mutation marks owning collection dirty → persisted via provider (only affected file)
- [x] Stable key ordering in serialization (future Git diffs)
- [x] Lazy load: summaries at startup, full collection body on first expand/open

## 3. Tabs & Explicit Save

- [x] `tabStore`: `tabs[]`, `activeTabId`; migrate current single-request `requestStore` state into per-tab `draft` (builder components read/write active tab)
- [x] `normalizeForCompare(req)`: strip row ids, trailing blank rows, transient fields → JSON string; `dirty` selector per PRD FR3
- [x] Save flow: dirty-aware Save button (disabled ⇄ enabled), `Cmd/Ctrl+S`; new tab → Save dialog (name + collection/folder tree picker); existing → overwrite node + refresh snapshot
- [x] Tab bar UI: dirty dot, close with Save/Discard/Cancel prompt on dirty, middle-click close, `Cmd/Ctrl+T` new tab, `Cmd/Ctrl+W` close
- [x] Session persistence: open tabs + drafts debounced (500 ms) to session file; restore on launch
- [x] Tests: dirty transitions (new / edited / reverted / saved), normalization ignores cosmetic rows

## 4. Sidebar: Real Collections Tree

- [x] Delete hardcoded `groups` mock in `Sidebar.tsx`; render from `collectionStore`
- [x] Recursive tree with **virtualization** (only visible nodes render); expand/collapse state persisted in session
- [ ] Node interactions: click request → open/focus tab; context menu (new request, new folder, rename, duplicate, delete); inline rename
- [x] "New Collection" button; empty states
- [x] Search filters tree by request name/url (flat result list is acceptable)

## 5. Drag-and-Drop

- [ ] Spike (time-boxed ½ day): `@dnd-kit` vs `pragmatic-drag-and-drop` on a 5k-node virtualized tree → pick winner
- [x] Implement: reorder within folder, move into folder (any depth), move across collections
- [x] Guards: no folder into own descendant; drop-line indicator (before/after/inside); hover ~600 ms auto-expands folder; auto-scroll at edges; Esc cancels
- [x] Persistence: single-collection move saves one file; cross-collection saves both; failure rolls back store
- [x] Fallback: context-menu "Move to…" tree picker
- [ ] Tests: move validation (descendant guard), rollback on failed save

## 6. History

- [x] Hook into send pipeline: on response (incl. 4xx/5xx), `appendHistory` entry (PRD FR6); network errors logged with `status: 0`
- [x] Sidebar history view: day-grouped, newest first, method badge + status + duration; click → new **unsaved** tab
- [x] Search/filter: URL substring, method, status class
- [x] Retention: cap 1,000 entries via file rotation (write tail to new file when exceeded), clear-history with confirm

## 7. Environment Variables (should-have — cut to Phase 3.5 if needed)

- [x] `environments.json` shape + `environmentStore`; env selector in toolbar; simple key/value editor
- [x] `{{var}}` substitution at send time and cURL export only; unresolved vars → warning toast
- [x] Tests: substitution in url/params/headers/body/auth; stored text keeps placeholders

## 8. Performance & Safety Verification

- [x] Seed script: generate workspace with 50 collections / 10k requests / 12-level nesting
- [ ] Measure against PRD FR5 targets: cold start, expand, DnD frame times, 5 MB save; fix regressions (memoization, worker parse) before closing phase
- [ ] Crash test: kill app during save loop ×20 → verify no corrupt/lost data (worst case `.bak` restore)
- [x] Grep check: no fs/tauri-fs usage in `src/` outside `src/lib/storage/` (acceptance #7)
- [x] Update README + AGENTS.md (storage layout, provider rule: all persistence via StorageProvider)

---

## Definition of Done

PRD §5 acceptance criteria 1–7 pass. App restart restores collections, tabs, and history exactly; new tabs are never saved without an explicit Save; 10k-request workspace stays smooth; Git/cloud remain pluggable behind `StorageProvider` with zero UI changes required later.
