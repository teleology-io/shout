# Shout — Feature Backlog

Compiled by comparing Yaak, Postman, and Insomnia against shout's current capabilities.

Each file is a self-contained implementation plan an agent can follow.

---

## Protocol Support

| Feature | Source | File |
|---------|--------|------|
| WebSocket (WS/WSS) | Yaak, Insomnia | [websocket-support.md](websocket-support.md) |
| gRPC (unary + server-streaming) | Yaak, Insomnia | [grpc-support.md](grpc-support.md) |
| Server-Sent Events (SSE) | Yaak, Insomnia | [sse-support.md](sse-support.md) |
| Streaming HTTP responses | Yaak | [streaming-response.md](streaming-response.md) |

## Authentication

| Feature | Source | File |
|---------|--------|------|
| OAuth 2.0 (Auth Code + PKCE, Client Credentials) | Yaak, Postman | [oauth2-auth.md](oauth2-auth.md) |
| JWT (sign + inject on each request) | Yaak | [jwt-auth.md](jwt-auth.md) |
| AWS Signature v4 | Yaak | [aws-sig-v4-auth.md](aws-sig-v4-auth.md) |
| Auth inheritance (collection → folder → request) | Yaak | [auth-inheritance.md](auth-inheritance.md) |

## Request Features

| Feature | Source | File |
|---------|--------|------|
| cURL import (paste cURL → request) | Yaak | [curl-import.md](curl-import.md) |
| Multipart / file upload body | Standard | [multipart-file-upload.md](multipart-file-upload.md) |
| Request chaining & response extraction | Yaak, Postman | [request-chaining.md](request-chaining.md) |
| Request description editor (markdown) | Yaak, Postman | [request-description.md](request-description.md) |
| Cookie manager | Yaak | [cookie-manager.md](cookie-manager.md) |

## Response Features

| Feature | Source | File |
|---------|--------|------|
| XML / HTML / image / binary formatters | Yaak, Postman | [response-formatters.md](response-formatters.md) |
| Response history per request | Postman, Yaak | [response-history.md](response-history.md) |

## Collections & Organization

| Feature | Source | File |
|---------|--------|------|
| Collection runner (sequential batch send) | Postman, Insomnia | [collection-runner.md](collection-runner.md) |
| Nested folders (sub-groups) | Postman, Yaak | [nested-folders.md](nested-folders.md) |
| Folder-level variables | Yaak | [folder-variables.md](folder-variables.md) |
| Postman/Insomnia import + collection export | Yaak, Insomnia | [export-import-collections.md](export-import-collections.md) |

## Developer Experience

| Feature | Source | File |
|---------|--------|------|
| Command palette (Cmd+K) | Yaak | [command-palette.md](command-palette.md) |
| Keyboard shortcuts | Yaak | [keyboard-shortcuts.md](keyboard-shortcuts.md) |
| GraphQL schema explorer | Yaak | [graphql-explorer.md](graphql-explorer.md) |
| Code snippet language expansion (Go, Ruby, Rust, Java…) | Yaak | [code-snippet-expansion.md](code-snippet-expansion.md) |
| Theme switcher | Yaak (30+ themes) | [theme-switcher.md](theme-switcher.md) |
| Proxy configuration | Yaak | [proxy-config.md](proxy-config.md) |

---

## What shout already has (not in backlog)
- HTTP: GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS
- Body: JSON, text, form (URL-encoded), GraphQL (with variables)
- Auth: Bearer, Basic, API Key
- Collections + folders + drag-and-drop
- Environments with `{{variable}}` substitution
- Variable preview strip
- Tab management (dirty state, close/close-all/etc.)
- Code snippets: cURL, wget, Python, JavaScript
- OpenAPI YAML/JSON import
- Fuzzy search in sidebar
- JSON syntax highlighting
- Auto-updater
