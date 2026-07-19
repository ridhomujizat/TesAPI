# GetMan — Phase 2 Plan: cURL Import/Export (Custom Handler)

**Goal:** Paste any cURL (bash / Windows cmd / PowerShell) → filled request form; export any request as cURL.
**Duration:** ~1 week
**PRD:** `docs/phase-2-prd.md`
**Note:** Replaces the current POSIX-only `src/lib/curl.ts`. No external parser library.

---

## 1. Module Layout

```
src/lib/curl/
├── index.ts        # public API: parseCurl(), toCurl(), isCurlCommand()
├── normalize.ts    # dialect detection + cmd/PowerShell → canonical string
├── tokenize.ts     # canonical string → argv[]
├── map.ts          # argv[] → CurlParseResult (flag table)
├── export.ts       # GetmanRequest → curl string
└── __tests__/
    ├── fixtures.ts # raw strings: chrome-cmd, chrome-bash, powershell, ...
    ├── normalize.test.ts
    ├── tokenize.test.ts
    ├── parse.test.ts
    └── export.test.ts
```

- [x] Scaffold folder first; keep old `curl.ts` until parity, then remove it
- [x] Add fixtures first, starting with the exact failing Chrome/Windows sample (PRD §1)

## 2. Normalizer

- [x] `detectDialect(s): 'bash' | 'cmd' | 'powershell'`
  - cmd: `/\^"/` or `/\^\s*\r?\n/` present
  - powershell: `` /`\s*\r?\n/ `` or leading `curl.exe` with `` `" ``
  - else bash
- [x] `normalize(s): string` → canonical bash-like string:
  - cmd: strip `^` line continuations → space; `^X` → `X`; result leaves `\"` escapes for tokenizer (`^\^"` → `\"` ✓)
  - powershell: `` ` `` continuations → space; `` `n ``/`` `t `` → LF/TAB; `` `X `` → `X`; `` `" `` → `\"`
  - bash: `\` + newline → space (pass-through otherwise)
- [x] Unit tests: each dialect sample normalizes to the same canonical string

## 3. Tokenizer

- [x] Rewrite quote-aware splitter (base on existing `tokens()` in curl.ts):
  - `'…'` literal, `"…"` with `\"` `\\`, `$'…'` ANSI-C (`\n`, `\t`, `\'`, `\xNN`)
  - adjacent concatenation: `-H"a: b"` → one token `-Ha: b` handled in map step; `"a"'b'` → `ab`
  - `--flag=value` split into two argv entries
- [x] Error on unclosed quote → `{ok:false}`
- [x] Unit tests incl. quotes-in-quotes, `sec-ch-ua` style values

## 4. Flag Mapper

- [x] Table-driven: `{ flags: string[], takesValue: boolean, apply(state, value) }`
- [x] Implement full mapping per PRD FR3: url/params split (reuse `parseParams`, tolerate `?&`), `-X`, `-H` (+ Authorization → auth extraction), `-b` → Cookie, data family + body-type inference + POST inference, `--data-urlencode`, `-F` (+ `@file`), `-u`, `-G`, `-A`, `-e`, `--json`, `-I`, ignore-list, unknown-flag → `warnings[]`
- [x] Return `CurlParseResult` (PRD FR4) — never throw
- [x] `parse.test.ts`: all fixtures → assert full `GetmanRequest` shape; acceptance criteria #1–#2 as concrete tests

## 5. Exporter

- [x] `toCurl(req): string` — bash dialect, multi-line `\`, single-quote escaping `'\''`
- [x] Serialize: method (omit `-X GET`), url incl. enabled params, enabled headers, auth (`-u` / Bearer header), body by type (`--data-raw` json/text, `--data-urlencode` pairs, `-F` form)
- [x] Round-trip tests (acceptance #3)
- [ ] Nice-to-have: `dialect:'cmd'` output

## 6. UI Integration

- [x] `UrlBar`: `onPaste` → `isCurlCommand(text)` → parse → on success `preventDefault()`, replace request in `requestStore`, toast "Imported from cURL" + warnings; on failure preserve the existing request and show an error toast
- [x] Use URL-bar paste as the import entry point; standalone Import cURL button/modal removed by UI decision
- [x] "Copy as cURL" button beside Send → `toCurl(activeRequest)` → clipboard + toast
- [x] Toast component if not present yet (simple, reusable — history/mock phases will want it)

## 7. Cleanup & Verification

- [x] Delete old `src/lib/curl.ts` / `curl.test.ts`, switch imports to `lib/curl`
- [x] Run full test suite
- [x] Copy-as-cURL output runs in a real terminal (`bash`) and returns a response
- [ ] Paste PRD §1 sample → sends successfully against staging (headers identical in devtools/proxy)
- [x] Update README + AGENTS.md (new module, no external curl lib policy)

---

## Definition of Done

PRD §4 acceptance criteria 1–5 all pass; the Chrome/Windows sample imports flawlessly via URL-bar paste; export round-trips.
