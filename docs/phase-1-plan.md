# GetMan — Phase 1 Plan: Core Request Engine

**Stack:** Tauri 2 + React 18 + TypeScript + Vite
**Goal:** Send a request, see a response. This is the MVP.
**Duration:** ~1–2 weeks

---

## 1. Project Setup (Day 1)

- [ ] `npm create tauri-app@latest getman` → React + TypeScript template
- [ ] Add deps: `zustand` (state), `@tanstack/react-query` (optional), `tailwindcss`, `lucide-react` (icons)
- [ ] Rust side: add `reqwest` (with `json`, `rustls-tls` features) and `serde`/`serde_json` to `src-tauri/Cargo.toml`
- [ ] Set up folder structure:

```
src/
├── components/
│   ├── layout/        # AppShell, Sidebar, panes
│   ├── request/       # UrlBar, MethodSelect, KeyValueEditor, BodyEditor, tabs
│   └── response/      # ResponseViewer, StatusBadge, JsonTree, HeadersTable
├── store/             # zustand stores (requestStore, responseStore)
├── types/             # Request, Response models
└── lib/               # http invoke wrapper, formatters
src-tauri/src/
├── http.rs            # send_request command (reqwest)
└── main.rs
```

## 2. Data Model (Day 1)

Define once — every later phase (history, cURL, mock) reads/writes this shape:

```ts
interface KeyValue { id: string; key: string; value: string; enabled: boolean; description?: string }

interface GetmanRequest {
  id: string;
  name?: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
  url: string;
  params: KeyValue[];
  headers: KeyValue[];
  body: {
    type: 'none' | 'json' | 'text' | 'form-data' | 'x-www-form-urlencoded';
    raw?: string;
    formData?: KeyValue[];
  };
  auth: { type: 'none' | 'bearer' | 'basic' | 'api-key'; token?: string; username?: string; password?: string; key?: string; value?: string; addTo?: 'header' | 'query' };
}

interface GetmanResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;            // raw text; parse JSON in UI
  timeMs: number;
  sizeBytes: number;
}
```

## 3. Rust HTTP Command (Day 2–3)

All requests go through Rust → no CORS problems.

- [ ] `#[tauri::command] async fn send_request(req: GetmanRequest) -> Result<GetmanResponse, HttpError>`
- [ ] Build reqwest request: method, URL + query params, headers, body, auth
- [ ] Measure `timeMs` with `std::time::Instant`, `sizeBytes` from body length
- [ ] 30s default timeout (configurable later)
- [ ] Error enum → friendly messages: `Timeout`, `DnsFailure`, `ConnectionRefused`, `InvalidUrl`, `TlsError`, `Unknown`
- [ ] Never treat 4xx/5xx as errors — they're valid responses

## 4. Request Builder UI (Day 3–6)

- [ ] **URL bar row:** method dropdown (color-coded) + URL input + Send button
  - Enter key sends; Send shows spinner + becomes Cancel while in-flight
- [ ] **Tabs:** Params / Headers / Body / Auth
- [ ] **KeyValueEditor** (shared by Params & Headers): checkbox to enable/disable, key/value/description inputs, auto-append empty row, delete row
  - Params tab ⇄ URL query string two-way sync
- [ ] **BodyEditor:** type selector (none / raw JSON / text / form-data / urlencoded); raw editor with monospace font + "Beautify" button (`JSON.stringify(parse, null, 2)`); form-data reuses KeyValueEditor
- [ ] **AuthEditor:** none / Bearer / Basic / API key — injects header (or query) at send time, not stored in headers list
- [ ] State: one `requestStore` (zustand) holding the active `GetmanRequest`

## 5. Response Viewer (Day 6–9)

- [ ] Summary row: status badge (green 2xx / yellow 3xx / orange 4xx / red 5xx), time, size
- [ ] Tabs: Body / Headers / (Cookies later)
- [ ] **Body:** pretty-printed JSON with collapsible tree + syntax highlighting (use `react-json-view-lite` or CodeMirror 6 read-only), Raw toggle, Copy button
- [ ] Auto-detect content type from `Content-Type` header (JSON / HTML / text / image)
- [ ] **Headers:** simple two-column table
- [ ] Empty state ("Hit Send to see the response") and error state (friendly message from Rust error enum, no stack traces)

## 6. Error Handling & Polish (Day 9–10)

- [ ] Invalid URL → inline validation before sending
- [ ] Timeout / DNS / refused → distinct messages in response pane
- [ ] Cancel in-flight request (abort via command or ignore stale result)
- [ ] Loading skeleton in response pane
- [ ] Keyboard: `Cmd+Enter` = send

## 7. Verification checklist (end of phase)

- [ ] GET https://httpbin.org/get with query params → params visible in echoed response
- [ ] POST JSON to https://httpbin.org/post → body echoed, pretty-printed
- [ ] Bearer auth → `Authorization` header present in echo
- [ ] https://httpbin.org/status/500 → red badge, body shown, no crash
- [ ] https://httpbin.org/delay/35 → clean timeout message
- [ ] Nonexistent domain → DNS failure message
- [ ] Large JSON (1MB+) renders without freezing

## Out of scope (later phases)

cURL import/export (P2) · history & collections & env vars (P3) · mock server (P4) · AI/MCP (P5). But: the `GetmanRequest` shape and the fact that all traffic flows through one Rust command are the contracts those phases depend on — don't shortcut them.
