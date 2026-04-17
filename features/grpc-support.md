# gRPC Support

## Summary
Add gRPC request type: load a `.proto` file (or use server reflection), browse services/methods, and invoke unary and streaming RPC calls.

## Motivation
Yaak and Insomnia both support gRPC. Backend teams increasingly use gRPC for internal services. Without it, shout is not a viable replacement for those teams.

## Scope
- Upload or reference a `.proto` file per collection/request
- Proto parsing: extract services, methods, and message schemas
- Unary RPC call with a JSON body editor (mapped to protobuf)
- Server-side streaming viewer (similar to SSE log)
- Client streaming and bidirectional streaming (v2)
- gRPC-web is a stretch goal

## Out of Scope
- gRPC reflection without a proto file (v2 — requires a running server)
- Protobuf binary view

---

## Plan

### 1. Types (`src/types/index.ts`)
- Add `'GRPC'` to `HttpMethod` or create a parallel `requestKind`
- Add `GrpcConfig`:
  ```ts
  interface GrpcConfig {
    protoPath?: string       // path to .proto file on disk
    protoContent?: string    // pasted proto text
    service: string
    method: string
    metadata: KeyValue[]     // gRPC metadata = HTTP headers
    tls: boolean
  }
  ```
- Add `grpcConfig?: GrpcConfig` to `RequestTab`

### 2. Rust backend (`src-tauri/src/grpc.rs`)
- Use `tonic` crate for gRPC client
- Parse `.proto` via `prost-build` at runtime or via `protox`
- Command `grpc_call(url, service, method, body_json, metadata, tls)` → returns JSON response or streams events
- Emit Tauri events for streaming responses

### 3. Proto explorer UI (`src/components/GrpcPanel.tsx`)
- **Proto tab**: textarea to paste proto, or file picker to load from disk
- **Service/Method selector**: two dropdowns populated from parsed proto
- **Request tab**: JSON editor pre-populated with an empty message skeleton inferred from the proto schema
- **Metadata tab**: KeyValueEditor for gRPC metadata
- **Response**: JSON pretty-print for unary; streaming log for server-side streaming

### 4. Store
- `callGrpc(tabId)` action analogous to `sendRequest`
- Store `grpcConfig` alongside the tab

### 5. Cargo.toml
```toml
tonic = { version = "0.11", features = ["tls"] }
prost = "0.12"
protox = "0.5"
```

### 6. Sidebar / Method colors
- Add `GRPC` with color `#0097a7`

---

## Files to Create / Modify
| File | Change |
|------|--------|
| `src/types/index.ts` | GrpcConfig type, add GRPC method |
| `src/store/useStore.ts` | callGrpc action |
| `src/components/GrpcPanel.tsx` | New component |
| `src/components/RequestPanel.tsx` | Route to GrpcPanel |
| `src-tauri/src/grpc.rs` | New module |
| `src-tauri/src/main.rs` | Register grpc commands |
| `src-tauri/Cargo.toml` | tonic, prost, protox deps |
