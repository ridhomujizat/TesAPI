# GetMan — Phase 2 PRD: cURL Import/Export (Custom Parser)

**Status:** Draft
**Owner:** ridho
**Stack context:** Tauri 2 + React 19 + TypeScript. Existing partial parser at `src/lib/curl.ts` (POSIX-only, will be replaced).

---

## 1. Problem

Chrome DevTools on Windows copies cURL in **cmd.exe dialect** — caret (`^`) escapes, `^"` quotes, `^\^"` embedded quotes, `^` line continuations. Existing libraries (`curl-to-json`, etc.) and GetMan's current tokenizer only understand POSIX/bash quoting and fail on this real-world sample:

```
curl ^"https://api-staging.omnix.co.id/...?^&start_date=...^" ^
  -H ^"accept: application/json, text/plain, */*^" ^
  -b ^"Path=/; access_token=eyJ...^" ^
  -H ^"sec-ch-ua: ^\^"Not;A=Brand^\^";v=^\^"8^\^"...^"
```

Failures observed: caret quotes not stripped, `^&` breaking the URL, `^\^"` corrupting header values, `-b` (cookie) ignored. **Decision: build our own handler** — no external cURL-parsing dependency.

## 2. Goals / Non-Goals

**Goals**

- Paste any cURL copied from Chrome (bash, cmd, PowerShell), Firefox, Postman, or hand-written → correctly fills the request builder.
- Export the current request as a copyable cURL command (bash format; cmd optional).
- Auto-detect a pasted cURL string in the URL bar and convert it in place.

**Non-Goals**

- Executing curl-only features (`--retry`, `--proxy`, `-o`, `--cert`, …) — parse-tolerate and report as "ignored", never crash.
- Full cmd.exe/PowerShell emulation (env var expansion `%VAR%`/`$env:VAR` is out of scope; leave literal).

## 3. Functional Requirements

### FR1 — Dialect detection & normalization

| Dialect | Signals | Normalization |
|---|---|---|
| cmd.exe (Chrome/Windows) | `^"` sequences, `^` before newline, `^\^"` | `^` + newline → space; `^X` → `X` (caret escapes next char); result then tokenized as double-quoted string with `\"` escapes |
| PowerShell | backtick before newline, `curl.exe`, `` `" `` | `` ` `` + newline → space; `` `X `` → escape map (`` `n ``→LF, `` `t ``→TAB, else `X`) |
| bash/POSIX | default | `\` + newline → space; standard quoting |

Detection is heuristic, run once on the whole string before tokenizing. Ambiguous input falls back to bash.

### FR2 — Tokenizer

Quote-aware splitter producing argv: handles `'…'`, `"…"` (with `\"`, `\\`), `$'…'` ANSI-C strings, unquoted backslash escapes, adjacent-token concatenation (`-H"a: b"`), and `--flag=value` form.

### FR3 — Flag mapping → `GetmanRequest`

| Flag | Mapping |
|---|---|
| `<url>` (first non-flag arg) / `--url` | `url`; query string split into `params[]` (tolerate `?&x=y` — drop empty pair); disabled/empty values kept |
| `-X`, `--request` | `method` |
| `-H`, `--header` | `headers[]` (split on first `:`); `Authorization: Bearer x` → `auth.bearer`; `Authorization: Basic b64` → decode → `auth.basic` |
| `-b`, `--cookie` | `Cookie` header row |
| `-d`, `--data`, `--data-raw`, `--data-binary`, `--data-ascii` | body; JSON-looking → `body.type='json'`, else honor `Content-Type` header, else `x-www-form-urlencoded` if `k=v&k=v` shaped, else `text`. Multiple `-d` join with `&`. Method → POST if still GET |
| `--data-urlencode` | body urlencoded pair (encode value) |
| `-F`, `--form` | `body.type='form-data'`; `name=@file` → file-type row (name only, no bytes) |
| `-u`, `--user` | `auth.basic` |
| `-G`, `--get` | move `-d` pairs into `params[]`, method GET |
| `-A`, `--user-agent` / `-e`, `--referer` | corresponding header rows |
| `--json` | body json + `Content-Type`/`Accept` headers, POST |
| `-I`, `--head` | method HEAD |
| `--compressed`, `-s`, `-k`, `--insecure`, `-L`, `--location`, `-v` | ignored silently |
| Unknown flags | skipped (with value if flag is known value-taking); collected into `warnings[]` |

### FR4 — Result contract

```ts
type CurlParseResult =
  | { ok: true; request: GetmanRequest; warnings: string[] }
  | { ok: false; error: string };
```

Never throws. `warnings` surfaces ignored/unknown flags in the UI toast.

### FR5 — Export to cURL

- `toCurl(req, opts?): string` — bash dialect default: single-quoted values (`'\''` escaping), multi-line with `\` continuations, order: method → url(with params) → headers → auth → body.
- Auth serialized as proper flag (`-u`) or header (`Authorization: Bearer`), never both.
- form-data rows → `-F`; file rows → `-F 'name=@filename'`.
- Optional `dialect: 'cmd'` (caret-escaped) — nice-to-have, not required for done.

### FR6 — UI

- **Paste in URL bar:** on paste, if trimmed text starts with `curl` (case-insensitive, incl. `curl.exe`) → parse; on success replace entire request state + toast "Imported from cURL" (+ warnings); on failure leave paste as-is.
- **Import dialog:** "Import cURL" button in sidebar/toolbar → textarea modal → Import.
- **Export:** "Copy as cURL" button (code icon) near Send → clipboard + toast.

## 4. Acceptance Criteria

1. The Chrome/Windows sample above parses to: GET, correct full URL, 5 query params (`start_date`, `end_date`, `type_date`, `product_id` empty, `campaign_id` empty), 13 headers incl. `sec-ch-ua: "Not;A=Brand";v="8", "Chromium";v="150", "Google Chrome";v="150"` (quotes intact), Cookie header from `-b`.
2. Chrome "Copy as cURL (bash)" and "(PowerShell)" equivalents of the same request parse to the identical `GetmanRequest`.
3. Round-trip: `parseCurl(toCurl(req))` ≡ `req` (modulo ids/row order) for representative requests (GET+params, POST json, form-data, basic auth, bearer).
4. Malformed input (`curl`, `curl -H`, unclosed quote) returns `ok:false` with message — no crash, no state mutation.
5. All parsing is pure TS in `src/lib/` with unit tests; no new runtime dependency.

## 5. Test Fixtures (minimum)

Chrome cmd sample (this PRD §1), Chrome bash sample, PowerShell sample, POST json (`--data-raw '{...}'`), form-data with `@file`, `-u user:pass`, `-G -d`, `--data-urlencode`, headers with `:` in value, single quotes containing double quotes and vice versa, `--json`, multiple `-d`, unknown flags, empty/garbage input.
