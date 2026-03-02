# shout

A fast, cross-platform API client. Import OpenAPI specs, build requests, inspect responses.

Built with [Tauri](https://tauri.app) + React + TypeScript.

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

## Features

- **HTTP client** — GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS
- **Params, Headers, Body, Auth** — per-request configuration
- **Auth** — Bearer token, Basic, API key (header or query)
- **Body** — JSON, plain text, form-encoded
- **OpenAPI import** — load a `.yml`, `.yaml`, or `.json` spec from a local file, URL, or paste. All endpoints are imported as a collection instantly
- **Collections** — save and organise requests, reopen with one click
- **Response viewer** — status, timing, size, JSON syntax highlighting, raw/formatted toggle, copy to clipboard
- **Persistent storage** — collections and open tabs survive restarts (stored in the app's local storage)
