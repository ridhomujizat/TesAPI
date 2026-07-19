# Tauri + React + Typescript

This template should help get you started developing with Tauri, React and Typescript in Vite.

## cURL import/export

Phase 2 uses the pure TypeScript parser in `src/lib/curl/`. It accepts Bash/POSIX, Windows `cmd.exe`, and PowerShell cURL copied from browser developer tools, including caret/backtick continuations, quoted headers, cookies, JSON, form-data, basic auth, and bearer auth. Unknown cURL-only flags are tolerated with warnings instead of crashing the request builder.

The request builder detects cURL pasted into the URL field and copies the active request back to a multiline Bash cURL command. There is no runtime cURL parsing dependency.

Run the parser checks directly with Node 22+:

```sh
node src/lib/curl/__tests__/normalize.test.ts
node src/lib/curl/__tests__/tokenize.test.ts
node src/lib/curl/__tests__/parse.test.ts
node src/lib/curl/__tests__/export.test.ts
```

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
