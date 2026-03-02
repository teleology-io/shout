# shout

A fast, cross-platform API client. Import OpenAPI specs, build requests, inspect responses.

Built with [Tauri](https://tauri.app) + React + TypeScript.

<!-- Add a screenshot: run `npm run tauri dev`, take a screenshot, save to docs/screenshot.png -->
<!-- ![shout](docs/screenshot.png) -->

---

## Features

**Requests**
- All HTTP methods — GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS
- Query params, headers, and auth — per-request with enable/disable toggles
- **Auth** — Bearer token, Basic, API key (header or query param)
- **Body types** — JSON (syntax-highlighted editor with Format button), plain text, form-encoded, GraphQL
- **GraphQL** — dedicated query editor with a separate variables pane (JSON). Automatically sets `Content-Type: application/json` and sends `{ query, variables }` as the request body

**Response**
- Status code, timing, and size at a glance
- **Body** — JSON syntax highlighting, raw/formatted toggle, word-wrap toggle, copy to clipboard
- **Headers** — table view of all response headers
- **Preview** — renders image, video, and audio responses inline; HTML responses in a sandboxed iframe

**Collections & organisation**
- Save requests to named collections, grouped into folders
- Drag-and-drop to reorder requests and groups
- Import from OpenAPI specs (`.yml`, `.yaml`, `.json`) — load from file, URL, or paste

**Environments**
- Add multiple environments per collection (e.g. dev, staging, prod)
- Set variables like `baseUrl`, auth tokens, and API keys per environment
- Reference variables anywhere with `{{variableName}}` syntax — in the URL, headers, params, body, and auth fields
- Active environment resolves all variables at send time
- Unresolved variables shown as amber badges; resolved ones shown in primary colour

**Code export**
- **Code** button generates ready-to-run snippets in cURL, wget, Python (`requests`), and JavaScript (`fetch`)
- Snippet dialog shows all formats in one place with a one-click copy button

**Other**
- Resizable request/response split pane
- Persistent state — open tabs and collections survive restarts
- Dark theme throughout

---

## Requirements

- [Node.js](https://nodejs.org) 18+
- [Rust](https://rustup.rs) (for the Tauri desktop shell)

Install Rust if you don't have it:

```sh
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

## Install dependencies

```sh
npm install
```

## Development

**Full desktop app** (recommended — HTTP requests go through Rust, no CORS issues):

```sh
npm run tauri dev
```

**Frontend only** (browser at `http://localhost:1420`, some APIs may have CORS issues):

```sh
npm run dev
```

## Build

Builds the frontend and packages it into a native binary for your platform:

```sh
npm run tauri build
```

Output is in `src-tauri/target/release/bundle/`. On macOS this produces a `.app` and `.dmg`, on Windows an `.exe` installer, on Linux an `.AppImage` and `.deb`.

To type-check without building:

```sh
npx tsc --noEmit
```

## CI

GitHub Actions builds for macOS (x64 + arm64), Linux, and Windows on every push to `main` and on version tags (`v*`). Tagged builds are uploaded as GitHub Release assets.
