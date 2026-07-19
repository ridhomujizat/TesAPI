## Imported Claude Cowork project instructions

I want create app with AI, TesAPI app clone postman for my personal use. create plan several phases.
phase
for design, crul copy paste( in input url and can covert to that format) crul, history, mock server, mcp ai

## Phase 3 implementation notes

- Local persistence lives under the Tauri app-data `tesapi/` directory and is accessed through `StorageProvider` / `LocalJsonProvider` only.
- Collections are nested-tree JSON files, history is capped NDJSON, and session/environment state are separate files.
- Collection writes use the Rust atomic-write command and retain a `.bak`; corrupt files are quarantined and recovered when possible.
- New tabs are drafts until explicit Save; sending only appends history. Environment placeholders resolve at send/cURL-export time.

## Phase 4 implementation notes

- `src/lib/variables.ts` owns the shared `{{variable}}` token grammar, tokenization, and resolution states; send-time substitution imports that grammar and keeps Phase 3 semantics.
- Request text fields that support placeholders use `VariableInput`. Raw request bodies pass variable statuses to `CodeEditor`, which refreshes CodeMirror decorations through a compartment without remounting the editor.
- Missing variables are fixed through `environmentStore`; quick-add can target an existing environment or create and activate a new one.

## Phase 5 implementation notes

- The app-global workspace registry and settings live in SQLite `app.db`; frontend access goes through `src/lib/registry/` only and Rust SQL stays in `src-tauri/src/db.rs`.
- Workspace request data remains spread files rooted at each registry row's `root_path`; `StorageProvider` stays unchanged and `LocalJsonProvider` is configured per window.
- Workspace boot and replacement use `src/lib/workspaces/lifecycle.ts` to reset and rehydrate collection, request, environment, history, and per-workspace session state.
- New windows receive `?workspaceId=` and register their workspace with the Rust window map so repeated opens focus the existing window.
- Git synchronization stays behind provider-level hooks: Rust owns init/clone/commit/push/pull, while local writes always complete before a sync warning is shown.

## Implementation and refactoring rules

- Preserve existing behavior, imports, exports, backward compatibility, and current naming conventions.
- Keep each file focused on a single responsibility and prefer composition over large monolithic components.
- Target 50–200 lines per file. Avoid files exceeding 300 lines unless there is a strong reason to keep them together.
- Split oversized or mixed-responsibility files into logical, feature-based folders rather than unrelated utility files.
- Extract reusable logic into hooks, services, utilities, or helpers only when it improves readability or removes duplication.
- Move shared constants, types, schemas, and configuration into dedicated files when appropriate.
- Reuse existing modules and remove duplicated logic before adding new code.
- Refactor the affected area first when necessary, then implement new functionality using the improved structure.
- Do not split files that are already simple and do not introduce speculative abstractions or over-engineering.

Phase 0 — Foundation & Design (Week 1)
Goal: Decide the stack and lock the UI layout before writing features.

Stack suggestion: Since it's personal use, keep it simple — a desktop app with Tauri or Electron + React, or even a pure web app (React + Vite) running locally. Tauri is lighter and avoids CORS issues since requests go through the Rust backend instead of the browser.
Design the 3-pane layout: left sidebar (collections + history), center (request builder: method dropdown, URL bar, tabs for Params / Headers / Body / Auth), bottom or right (response viewer with status, time, size, pretty-printed JSON).
Data model: define a Request object early (method, url, headers, params, body, auth) — every later feature (history, cURL, mock) reads/writes this same shape.
Storage: SQLite or a simple JSON file on disk.

Phase 1 — Core Request Engine (Week 1–2)
Goal: Send a request, see a response. This is the MVP.

URL bar + method selector (GET/POST/PUT/PATCH/DELETE)
Headers and query params as key–value editors
Body editor (raw JSON, form-data)
Response viewer: status code, response time, size, headers, and formatted body (JSON pretty-print with collapsible tree, syntax highlighting)
Basic error handling (timeouts, DNS failures, invalid URLs)

Phase 2 — cURL Import/Export (Week 2)
Goal: Paste a cURL command → it fills the request form; and export any request as cURL.

Import: parse curl strings (handle Bash, Windows cmd.exe, PowerShell, -X, -H, -d/--data, --data-raw, -u, -F, quotes and line continuations). TesAPI uses the pure TypeScript handler in `src/lib/curl/`; do not add an external cURL parser dependency.
Export: serialize the current Request object back into a copyable cURL command.
Bonus: detect when the user pastes a cURL string directly into the URL bar and auto-convert it — this is the "paste in input URL" behavior you described.

Phase 3 — History & Collections (Week 3)
Goal: Never lose a request.

Auto-save every sent request to history (timestamp, status, duration) in SQLite
Click a history item to reload it into the builder
Search/filter history by URL, method, or status
Save requests into named collections/folders for reuse
Environment variables ({{base_url}}, {{token}}) — small effort, huge payoff for switching between local/staging APIs

Phase 4 — Mock Server (Week 4)
Goal: Spin up local endpoints that return canned responses.

A local HTTP server (Express/Fastify in Node, or Axum if Tauri/Rust) started from the UI on a chosen port
Define mock routes: path + method → status code, headers, response body, optional delay
Nice-to-have: auto-generate a mock from a real response in your history ("mock this response" button)
Route matching with path params (/users/:id) and a request log so you can see what hit the mock

Phase 5 — AI + MCP Integration (Week 5+)
Goal: Make TesAPI AI-assisted.

AI features via the Anthropic API: generate a request from a natural-language description ("call the GitHub API to list my repos"), explain an error response, generate mock response bodies from a description or a JSON schema, summarize/diff two responses.
MCP server mode: expose TesAPI itself as an MCP server so Claude (Desktop/Code) can use your saved collections as tools — e.g. tools like send_request, list_collections, get_history. This turns your saved APIs into things an AI agent can call.
MCP client mode (optional, more advanced): let TesAPI connect to other MCP servers and test them, like an MCP inspector.
