use std::collections::HashMap;
use std::time::Instant;

use base64::{Engine as _, engine::general_purpose::STANDARD as B64};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
struct HttpRequest {
    method: String,
    url: String,
    headers: HashMap<String, String>,
    body: Option<String>,
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

#[tauri::command]
async fn make_http_request(request: HttpRequest) -> Result<HttpResponse, String> {
    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|e| e.to_string())?;

    let start = Instant::now();

    let method = reqwest::Method::from_bytes(request.method.to_uppercase().as_bytes())
        .map_err(|e| e.to_string())?;

    let mut req_builder = client.request(method, &request.url);

    for (key, value) in &request.headers {
        req_builder = req_builder.header(key.as_str(), value.as_str());
    }

    if let Some(body) = request.body {
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

    let headers: HashMap<String, String> = response
        .headers()
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
        .collect();

    let content_type = headers
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
        headers,
        body: body_str,
        body_encoding,
        size,
        time: elapsed,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![make_http_request])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
