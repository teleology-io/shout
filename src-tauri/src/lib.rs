use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Instant;

use base64::{Engine as _, engine::general_purpose::STANDARD as B64};
use futures_util::{SinkExt, StreamExt};
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, State};
use tokio::task::AbortHandle;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;

// ── State ─────────────────────────────────────────────────────────────────────

type HmacSha256 = Hmac<Sha256>;

/// Holds abort handles for active SSE connections.
struct SseMap(Mutex<HashMap<String, AbortHandle>>);

/// Holds abort handles for active stream connections.
struct StreamMap(Mutex<HashMap<String, AbortHandle>>);

/// Holds senders for active WebSocket connections.
struct WsMap(Mutex<HashMap<String, tokio::sync::mpsc::UnboundedSender<Option<String>>>>);

impl Default for SseMap {
    fn default() -> Self { SseMap(Mutex::new(HashMap::new())) }
}

impl Default for StreamMap {
    fn default() -> Self { StreamMap(Mutex::new(HashMap::new())) }
}

impl Default for WsMap {
    fn default() -> Self { WsMap(Mutex::new(HashMap::new())) }
}

// ── HTTP types ────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
struct MultipartField {
    name: String,
    value: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct ProxyConfig {
    enabled: bool,
    #[serde(rename = "type")]
    proxy_type: String,
    host: String,
    port: u16,
    auth_username: Option<String>,
    auth_password: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct AwsSigV4Config {
    #[serde(rename = "accessKeyId")]
    access_key_id: String,
    #[serde(rename = "secretAccessKey")]
    secret_access_key: String,
    #[serde(rename = "sessionToken")]
    session_token: Option<String>,
    region: String,
    service: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct HttpRequest {
    method: String,
    url: String,
    headers: HashMap<String, String>,
    body: Option<String>,
    multipart_fields: Option<Vec<MultipartField>>,
    proxy: Option<ProxyConfig>,
    aws_sig_v4: Option<AwsSigV4Config>,
}

#[derive(Debug, Serialize, Deserialize)]
struct HttpResponse {
    status: u16,
    status_text: String,
    headers: HashMap<String, String>,
    body: String,
    body_encoding: String,
    size: usize,
    time: u64,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn is_binary_content_type(content_type: &str) -> bool {
    let ct = content_type
        .split(';')
        .next()
        .unwrap_or("")
        .trim()
        .to_lowercase();

    if ct.starts_with("image/")
        || ct.starts_with("video/")
        || ct.starts_with("audio/")
        || ct.starts_with("font/")
    {
        return true;
    }

    if ct.starts_with("application/") {
        return !matches!(
            ct.as_str(),
            "application/json"
                | "application/ld+json"
                | "application/xml"
                | "application/javascript"
                | "application/x-javascript"
                | "application/graphql"
                | "application/x-www-form-urlencoded"
                | "application/x-ndjson"
        );
    }

    false
}

fn build_reqwest_client(proxy: &Option<ProxyConfig>) -> Result<reqwest::Client, String> {
    let mut builder = reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .redirect(reqwest::redirect::Policy::limited(10));

    if let Some(p) = proxy {
        if p.enabled && !p.host.is_empty() {
            let proxy_url = format!("{}://{}:{}", p.proxy_type, p.host, p.port);
            let mut rp = reqwest::Proxy::all(&proxy_url).map_err(|e| e.to_string())?;
            if let (Some(u), Some(pw)) = (&p.auth_username, &p.auth_password) {
                rp = rp.basic_auth(u, pw);
            }
            builder = builder.proxy(rp);
        }
    }

    builder.build().map_err(|e| e.to_string())
}

// ── AWS SigV4 signing ─────────────────────────────────────────────────────────

fn format_datetime_utc() -> (String, String) {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    // Manual UTC conversion (avoid chrono dep)
    let days_since_epoch = secs / 86400;
    let time_of_day = secs % 86400;
    let h = time_of_day / 3600;
    let m = (time_of_day % 3600) / 60;
    let s = time_of_day % 60;

    // Gregorian calendar algorithm
    let z = days_since_epoch + 719468;
    let era = z / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let mo = if mp < 10 { mp + 3 } else { mp - 9 };
    let yr = if mo <= 2 { y + 1 } else { y };

    let date_str = format!("{:04}{:02}{:02}", yr, mo, d);
    let datetime_str = format!("{}T{:02}{:02}{:02}Z", date_str, h, m, s);
    (datetime_str, date_str)
}

fn percent_encode_aws(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            _ => {
                out.push_str(&format!("%{:02X}", b));
            }
        }
    }
    out
}

fn hmac_sha256(key: &[u8], data: &[u8]) -> Vec<u8> {
    let mut mac = HmacSha256::new_from_slice(key).expect("HMAC can take any key size");
    mac.update(data);
    mac.finalize().into_bytes().to_vec()
}

fn sign_aws_sigv4(
    headers: &mut HashMap<String, String>,
    method: &str,
    url_str: &str,
    body: &[u8],
    cfg: &AwsSigV4Config,
) -> Result<(), String> {
    let (datetime, date) = format_datetime_utc();

    headers.insert("x-amz-date".to_string(), datetime.clone());
    if let Some(token) = &cfg.session_token {
        headers.insert("x-amz-security-token".to_string(), token.clone());
    }

    // Parse URL
    let parsed = reqwest::Url::parse(url_str).map_err(|e| e.to_string())?;
    let host = parsed.host_str().unwrap_or("").to_string();
    let port_suffix = match parsed.port() {
        Some(p) => format!(":{}", p),
        None => String::new(),
    };
    headers.insert("host".to_string(), format!("{}{}", host, port_suffix));

    let canonical_uri = {
        let p = parsed.path();
        if p.is_empty() { "/".to_string() } else { p.to_string() }
    };

    // Canonical query string
    let mut qp: Vec<(String, String)> = parsed
        .query_pairs()
        .map(|(k, v)| (percent_encode_aws(&k), percent_encode_aws(&v)))
        .collect();
    qp.sort();
    let canonical_qs = qp
        .iter()
        .map(|(k, v)| format!("{}={}", k, v))
        .collect::<Vec<_>>()
        .join("&");

    // Canonical headers (lowercase, sorted)
    let mut sorted_hdrs: Vec<(String, String)> = headers
        .iter()
        .map(|(k, v)| (k.to_lowercase(), v.trim().to_string()))
        .collect();
    sorted_hdrs.sort_by(|a, b| a.0.cmp(&b.0));

    let canonical_headers = sorted_hdrs
        .iter()
        .map(|(k, v)| format!("{}:{}\n", k, v))
        .collect::<String>();

    let signed_headers = sorted_hdrs
        .iter()
        .map(|(k, _)| k.as_str())
        .collect::<Vec<_>>()
        .join(";");

    // Payload hash
    let payload_hash = hex::encode(Sha256::digest(body));

    let canonical_request = format!(
        "{}\n{}\n{}\n{}\n{}\n{}",
        method.to_uppercase(),
        canonical_uri,
        canonical_qs,
        canonical_headers,
        signed_headers,
        payload_hash
    );

    // String to sign
    let credential_scope = format!("{}/{}/{}/aws4_request", date, cfg.region, cfg.service);
    let cr_hash = hex::encode(Sha256::digest(canonical_request.as_bytes()));
    let string_to_sign = format!("AWS4-HMAC-SHA256\n{}\n{}\n{}", datetime, credential_scope, cr_hash);

    // Signing key
    let date_key = hmac_sha256(format!("AWS4{}", cfg.secret_access_key).as_bytes(), date.as_bytes());
    let region_key = hmac_sha256(&date_key, cfg.region.as_bytes());
    let service_key = hmac_sha256(&region_key, cfg.service.as_bytes());
    let signing_key = hmac_sha256(&service_key, b"aws4_request");

    let signature = hex::encode(hmac_sha256(&signing_key, string_to_sign.as_bytes()));

    let auth = format!(
        "AWS4-HMAC-SHA256 Credential={}/{}, SignedHeaders={}, Signature={}",
        cfg.access_key_id, credential_scope, signed_headers, signature
    );
    headers.insert("authorization".to_string(), auth);

    Ok(())
}

// ── Commands ──────────────────────────────────────────────────────────────────

#[tauri::command]
async fn make_http_request(request: HttpRequest) -> Result<HttpResponse, String> {
    let client = build_reqwest_client(&request.proxy)?;
    let start = Instant::now();

    let method = reqwest::Method::from_bytes(request.method.to_uppercase().as_bytes())
        .map_err(|e| e.to_string())?;

    let mut headers = request.headers.clone();

    // Apply AWS SigV4 signing if requested
    let body_bytes_for_sig: Vec<u8> = request
        .body
        .as_deref()
        .map(|b| b.as_bytes().to_vec())
        .unwrap_or_default();

    if let Some(cfg) = &request.aws_sig_v4 {
        sign_aws_sigv4(&mut headers, &request.method, &request.url, &body_bytes_for_sig, cfg)?;
    }

    let mut req_builder = client.request(method, &request.url);

    for (key, value) in &headers {
        req_builder = req_builder.header(key.as_str(), value.as_str());
    }

    if let Some(fields) = request.multipart_fields {
        let mut form = reqwest::multipart::Form::new();
        for field in fields {
            form = form.text(field.name, field.value);
        }
        req_builder = req_builder.multipart(form);
    } else if let Some(body) = request.body {
        if !body.is_empty() {
            req_builder = req_builder.body(body);
        }
    }

    let response = req_builder
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    let elapsed = start.elapsed().as_millis() as u64;
    let status = response.status().as_u16();
    let status_text = response
        .status()
        .canonical_reason()
        .unwrap_or("Unknown")
        .to_string();

    let resp_headers: HashMap<String, String> = response
        .headers()
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
        .collect();

    let content_type = resp_headers
        .get("content-type")
        .map(|s| s.as_str())
        .unwrap_or("");

    let binary = is_binary_content_type(content_type);

    let body_bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read response body: {}", e))?;

    let size = body_bytes.len();

    let (body_str, body_encoding) = if binary {
        (B64.encode(&body_bytes), "base64".to_string())
    } else {
        (String::from_utf8_lossy(&body_bytes).to_string(), "utf8".to_string())
    };

    Ok(HttpResponse {
        status,
        status_text,
        headers: resp_headers,
        body: body_str,
        body_encoding,
        size,
        time: elapsed,
    })
}

// ── WebSocket ─────────────────────────────────────────────────────────────────

#[tauri::command]
async fn ws_connect(
    tab_id: String,
    url: String,
    headers: HashMap<String, String>,
    app: AppHandle,
    ws_map: State<'_, WsMap>,
) -> Result<(), String> {
    // Clean up existing connection for this tab
    {
        let mut map = ws_map.0.lock().unwrap();
        map.remove(&tab_id);
    }

    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<Option<String>>();
    {
        let mut map = ws_map.0.lock().unwrap();
        map.insert(tab_id.clone(), tx);
    }

    // Build request
    use tokio_tungstenite::tungstenite::client::IntoClientRequest;
    let mut req = url.as_str().into_client_request().map_err(|e| e.to_string())?;
    for (k, v) in &headers {
        if let Ok(name) = tokio_tungstenite::tungstenite::http::HeaderName::from_bytes(k.as_bytes()) {
            if let Ok(val) = tokio_tungstenite::tungstenite::http::HeaderValue::from_str(v) {
                req.headers_mut().insert(name, val);
            }
        }
    }

    let tab_id_clone = tab_id.clone();
    let app_clone = app.clone();

    tokio::spawn(async move {
        match connect_async(req).await {
            Ok((ws_stream, _)) => {
                app_clone
                    .emit("ws-open", serde_json::json!({ "tabId": tab_id_clone }))
                    .ok();

                let (mut write, mut read) = ws_stream.split();

                loop {
                    tokio::select! {
                        // Incoming message from server
                        msg = read.next() => {
                            match msg {
                                Some(Ok(Message::Text(text))) => {
                                    app_clone.emit("ws-message", serde_json::json!({
                                        "tabId": tab_id_clone,
                                        "data": text.to_string(),
                                    })).ok();
                                }
                                Some(Ok(Message::Binary(bytes))) => {
                                    let text = B64.encode(&bytes);
                                    app_clone.emit("ws-message", serde_json::json!({
                                        "tabId": tab_id_clone,
                                        "data": text,
                                    })).ok();
                                }
                                Some(Ok(Message::Close(_))) | None => {
                                    app_clone.emit("ws-close", serde_json::json!({ "tabId": tab_id_clone })).ok();
                                    break;
                                }
                                Some(Err(e)) => {
                                    app_clone.emit("ws-error", serde_json::json!({
                                        "tabId": tab_id_clone,
                                        "error": e.to_string(),
                                    })).ok();
                                    break;
                                }
                                _ => {}
                            }
                        }
                        // Outgoing message from frontend or disconnect signal
                        cmd = rx.recv() => {
                            match cmd {
                                Some(Some(data)) => {
                                    if write.send(Message::Text(data.into())).await.is_err() {
                                        break;
                                    }
                                }
                                Some(None) | None => {
                                    // Disconnect requested
                                    let _ = write.send(Message::Close(None)).await;
                                    app_clone.emit("ws-close", serde_json::json!({ "tabId": tab_id_clone })).ok();
                                    break;
                                }
                            }
                        }
                    }
                }
            }
            Err(e) => {
                app_clone
                    .emit("ws-error", serde_json::json!({
                        "tabId": tab_id_clone,
                        "error": e.to_string(),
                    }))
                    .ok();
            }
        }

        // Connection ended (map cleanup is done by ws_disconnect or next ws_connect)
    });

    Ok(())
}

#[tauri::command]
async fn ws_send(tab_id: String, data: String, ws_map: State<'_, WsMap>) -> Result<(), String> {
    let map = ws_map.0.lock().unwrap();
    if let Some(tx) = map.get(&tab_id) {
        tx.send(Some(data)).map_err(|_| "WebSocket not connected".to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn ws_disconnect(tab_id: String, ws_map: State<'_, WsMap>) -> Result<(), String> {
    let map = ws_map.0.lock().unwrap();
    if let Some(tx) = map.get(&tab_id) {
        let _ = tx.send(None); // Send disconnect signal
    }
    Ok(())
}

// ── SSE ───────────────────────────────────────────────────────────────────────

#[tauri::command]
async fn sse_connect(
    tab_id: String,
    url: String,
    headers: HashMap<String, String>,
    app: AppHandle,
    sse_map: State<'_, SseMap>,
) -> Result<(), String> {
    // Cancel existing
    {
        let map = sse_map.0.lock().unwrap();
        if let Some(h) = map.get(&tab_id) {
            h.abort();
        }
    }

    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(|e| e.to_string())?;

    let mut req = client.get(&url);
    for (k, v) in &headers {
        req = req.header(k.as_str(), v.as_str());
    }

    let tab_id_clone = tab_id.clone();
    let app_clone = app.clone();

    let task = tokio::spawn(async move {
        let response = match req.send().await {
            Ok(r) => r,
            Err(e) => {
                app_clone
                    .emit("sse-error", serde_json::json!({ "tabId": tab_id_clone, "error": e.to_string() }))
                    .ok();
                return;
            }
        };

        app_clone
            .emit("sse-open", serde_json::json!({ "tabId": tab_id_clone }))
            .ok();

        let mut stream = response.bytes_stream();
        let mut buf = String::new();
        let mut event_type = String::from("message");
        let mut event_id = String::new();
        let mut event_data = String::new();

        while let Some(chunk) = stream.next().await {
            match chunk {
                Ok(bytes) => {
                    let text = String::from_utf8_lossy(&bytes);
                    buf.push_str(&text);

                    // Process complete lines
                    while let Some(pos) = buf.find('\n') {
                        let line = buf[..pos].trim_end_matches('\r').to_string();
                        buf = buf[pos + 1..].to_string();

                        if line.is_empty() {
                            // Dispatch event
                            if !event_data.is_empty() {
                                app_clone
                                    .emit("sse-event", serde_json::json!({
                                        "tabId": tab_id_clone,
                                        "id": if event_id.is_empty() { None::<String> } else { Some(event_id.clone()) },
                                        "eventType": event_type.clone(),
                                        "data": event_data.trim_end_matches('\n').to_string(),
                                    }))
                                    .ok();
                            }
                            event_type = String::from("message");
                            event_id.clear();
                            event_data.clear();
                        } else if let Some(rest) = line.strip_prefix("data:") {
                            if !event_data.is_empty() {
                                event_data.push('\n');
                            }
                            event_data.push_str(rest.trim_start());
                        } else if let Some(rest) = line.strip_prefix("event:") {
                            event_type = rest.trim().to_string();
                        } else if let Some(rest) = line.strip_prefix("id:") {
                            event_id = rest.trim().to_string();
                        }
                        // ignore retry: and comments (:)
                    }
                }
                Err(e) => {
                    app_clone
                        .emit("sse-error", serde_json::json!({ "tabId": tab_id_clone, "error": e.to_string() }))
                        .ok();
                    return;
                }
            }
        }

        app_clone
            .emit("sse-close", serde_json::json!({ "tabId": tab_id_clone }))
            .ok();
    });

    let abort_handle = task.abort_handle();
    sse_map.0.lock().unwrap().insert(tab_id, abort_handle);

    Ok(())
}

#[tauri::command]
async fn sse_disconnect(tab_id: String, sse_map: State<'_, SseMap>, app: AppHandle) -> Result<(), String> {
    let map = sse_map.0.lock().unwrap();
    if let Some(h) = map.get(&tab_id) {
        h.abort();
    }
    app.emit("sse-close", serde_json::json!({ "tabId": tab_id })).ok();
    Ok(())
}

// ── Streaming HTTP ────────────────────────────────────────────────────────────

#[tauri::command]
async fn stream_request(
    tab_id: String,
    method: String,
    url: String,
    headers: HashMap<String, String>,
    body: Option<String>,
    app: AppHandle,
    stream_map: State<'_, StreamMap>,
) -> Result<(), String> {
    // Cancel existing
    {
        let map = stream_map.0.lock().unwrap();
        if let Some(h) = map.get(&tab_id) {
            h.abort();
        }
    }

    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|e| e.to_string())?;

    let meth = reqwest::Method::from_bytes(method.to_uppercase().as_bytes())
        .map_err(|e| e.to_string())?;
    let mut req = client.request(meth, &url);
    for (k, v) in &headers {
        req = req.header(k.as_str(), v.as_str());
    }
    if let Some(b) = body {
        if !b.is_empty() {
            req = req.body(b);
        }
    }

    let tab_id_clone = tab_id.clone();
    let app_clone = app.clone();

    let task = tokio::spawn(async move {
        let start = Instant::now();
        let response = match req.send().await {
            Ok(r) => r,
            Err(e) => {
                app_clone
                    .emit("stream-error", serde_json::json!({ "tabId": tab_id_clone, "error": e.to_string() }))
                    .ok();
                return;
            }
        };

        let status = response.status().as_u16();
        let status_text = response.status().canonical_reason().unwrap_or("Unknown").to_string();
        let resp_headers: HashMap<String, String> = response
            .headers()
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
            .collect();

        let mut stream = response.bytes_stream();
        let mut total_size: usize = 0;

        while let Some(chunk) = stream.next().await {
            match chunk {
                Ok(bytes) => {
                    total_size += bytes.len();
                    let text = String::from_utf8_lossy(&bytes).to_string();
                    app_clone
                        .emit("stream-chunk", serde_json::json!({ "tabId": tab_id_clone, "chunk": text }))
                        .ok();
                }
                Err(e) => {
                    app_clone
                        .emit("stream-error", serde_json::json!({ "tabId": tab_id_clone, "error": e.to_string() }))
                        .ok();
                    return;
                }
            }
        }

        let elapsed = start.elapsed().as_millis() as u64;
        app_clone
            .emit("stream-done", serde_json::json!({
                "tabId": tab_id_clone,
                "status": status,
                "statusText": status_text,
                "headers": resp_headers,
                "size": total_size,
                "time": elapsed,
            }))
            .ok();
    });

    let abort_handle = task.abort_handle();
    stream_map.0.lock().unwrap().insert(tab_id, abort_handle);

    Ok(())
}

#[tauri::command]
async fn cancel_stream(tab_id: String, stream_map: State<'_, StreamMap>) -> Result<(), String> {
    let map = stream_map.0.lock().unwrap();
    if let Some(h) = map.get(&tab_id) {
        h.abort();
    }
    Ok(())
}

// ── OAuth2 ────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
struct OAuth2TokenResponse {
    access_token: String,
    token_type: Option<String>,
    expires_in: Option<u64>,
    refresh_token: Option<String>,
    scope: Option<String>,
}

#[tauri::command]
async fn oauth2_client_credentials(
    token_url: String,
    client_id: String,
    client_secret: String,
    scope: Option<String>,
) -> Result<OAuth2TokenResponse, String> {
    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(|e| e.to_string())?;

    let mut params = vec![
        ("grant_type", "client_credentials".to_string()),
        ("client_id", client_id),
        ("client_secret", client_secret),
    ];
    if let Some(s) = scope {
        params.push(("scope", s));
    }

    let response = client
        .post(&token_url)
        .form(&params)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Token request failed ({}): {}", status, body));
    }

    response
        .json::<OAuth2TokenResponse>()
        .await
        .map_err(|e| e.to_string())
}

// ── Entry point ───────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(WsMap::default())
        .manage(SseMap::default())
        .manage(StreamMap::default())
        .invoke_handler(tauri::generate_handler![
            make_http_request,
            ws_connect,
            ws_send,
            ws_disconnect,
            sse_connect,
            sse_disconnect,
            stream_request,
            cancel_stream,
            oauth2_client_credentials,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application")
}
