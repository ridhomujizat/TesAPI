# GetMan — UI Design Prompt

Paste this prompt into Claude (or any coding agent) when building the UI. It defines the visual language once so every component stays consistent.

---

## Prompt

Build the UI for **GetMan**, a personal Postman-style API client (Tauri + React + TypeScript + Tailwind). Follow this design spec exactly.

### Overall feel

Clean, dense, developer-focused dark UI — closer to Linear/Raycast than Postman. Minimal chrome, no gradients, no shadows except subtle popover elevation. Everything keyboard-friendly. Information density over whitespace, but never cramped.

### Layout (3 panes)

- **Left sidebar (260px, collapsible):** icon rail for Collections / History / Environments at top; below it a searchable tree of collections and requests. Request rows show a small colored method tag + name, 32px row height, truncate with ellipsis.
- **Center top — request builder:** tab bar of open requests; breadcrumb (Collection › Request); URL row = method dropdown + URL input + Send button; below it tabs: Params · Headers · Body · Auth.
- **Center bottom — response pane:** horizontal split (draggable, default 55/45). Summary bar with status badge, time, size; tabs: Body · Headers.

### Color system (dark, CSS variables)

- Background layers: `--bg-app: #111214`, `--bg-panel: #17181B`, `--bg-elevated: #1D1F23`
- Borders: `--border: #26282D` — 1px, use borders not shadows to separate panes
- Text: `--text-primary: #E6E7EA`, `--text-secondary: #9A9CA3`, `--text-muted: #5E6167`
- Accent (Send button, active tab, focus rings): `--accent: #6E9BFF`
- Method colors (used for tags and dropdown): GET `#3FB68B` · POST `#F0A030` · PUT `#4A9EDE` · PATCH `#B98AF0` · DELETE `#E5534B`
- Status badges: 2xx `#3FB68B` · 3xx `#E8C547` · 4xx `#F0A030` · 5xx `#E5534B` — colored text + 12% opacity background pill, never solid fills

### Typography

- UI: Inter (or system-ui), 13px base, 12px secondary, 11px uppercase labels with 0.05em tracking
- Code (URL input, body editor, response, key-value values): JetBrains Mono 12.5px
- Weight: 400 default, 500 for active items, 600 only for the Send button and status codes

### Components

- **Method dropdown:** borderless, shows method in its color, chevron on hover only
- **URL input:** fills remaining width, monospace, subtle `--bg-elevated` background, accent focus ring; placeholder "Enter URL or paste cURL"
- **Send button:** solid accent, 32px height, radius 6px; spinner + turns into Cancel while in-flight
- **Tabs:** text-only, 2px accent underline for active, count chips (e.g. "Headers · 3") in `--text-muted`
- **Key-value editor:** borderless rows separated by `--border`, 32px height; checkbox · key · value · description · row-delete on hover; auto-append empty row; disabled rows at 40% opacity
- **JSON viewer:** collapsible tree, syntax colors — keys `#8AB4F8`, strings `#7EC699`, numbers `#F0A030`, booleans/null `#B98AF0`; line numbers in `--text-muted`; sticky Copy + Raw/Pretty toggle top-right
- **Empty states:** centered, small icon + one line of `--text-secondary`, no illustrations

### Interaction

- Radius 6px everywhere; 8px on popovers
- Transitions: 120ms ease-out, color/opacity only — nothing moves
- Focus visible on every interactive element (accent ring)
- Hover states: background shifts to `--bg-elevated`
- Shortcuts: `Cmd+Enter` send, `Cmd+T` new tab, `Cmd+W` close tab, `Cmd+K` search

### Don'ts

No pure black or white, no gradients, no drop shadows on panes, no more than one accent color, no animation on layout, no rounded pills for tabs, no icons where a short label is clearer.

---

## Usage tip

Give the agent this file plus `phase-1-plan.md` and ask for one component at a time (AppShell → UrlBar → KeyValueEditor → ResponseViewer). Reference sections by name, e.g. "follow the Key-value editor spec".
