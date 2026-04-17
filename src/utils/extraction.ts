import type { ResponseExtraction, ResponseData } from '../types'

/** Minimal JSONPath evaluator supporting $. dot notation and [index] */
function evalJsonPath(root: unknown, path: string): string | undefined {
  if (!path.startsWith('$.')) return undefined
  const parts = path
    .slice(2)
    .split(/[.\[\]]/)
    .filter(Boolean)

  let current: unknown = root
  for (const part of parts) {
    if (current === null || current === undefined) return undefined
    if (Array.isArray(current)) {
      const idx = parseInt(part, 10)
      if (!isNaN(idx)) {
        current = current[idx]
      } else {
        return undefined
      }
    } else if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[part]
    } else {
      return undefined
    }
  }

  if (current === undefined || current === null) return undefined
  if (typeof current === 'object') return JSON.stringify(current)
  return String(current)
}

export function runExtractions(
  response: ResponseData,
  extractions: ResponseExtraction[]
): Record<string, string> {
  const result: Record<string, string> = {}

  let parsedBody: unknown = null
  if (response.body && response.bodyEncoding !== 'base64') {
    try {
      parsedBody = JSON.parse(response.body)
    } catch {
      parsedBody = response.body
    }
  }

  for (const ex of extractions) {
    if (!ex.enabled || !ex.envVar) continue

    let value: string | undefined

    if (ex.from === 'header') {
      // Try case-insensitive header lookup
      const lowerPath = ex.path.toLowerCase()
      value =
        response.headers[lowerPath] ??
        response.headers[ex.path] ??
        Object.entries(response.headers).find(([k]) => k.toLowerCase() === lowerPath)?.[1]
    } else if (ex.from === 'body') {
      if (ex.path.startsWith('$.')) {
        value = evalJsonPath(parsedBody, ex.path)
      } else {
        // Treat as top-level key
        if (typeof parsedBody === 'object' && parsedBody !== null && !Array.isArray(parsedBody)) {
          const v = (parsedBody as Record<string, unknown>)[ex.path]
          if (v !== undefined && v !== null) value = String(v)
        }
      }
    }

    if (value !== undefined) {
      result[ex.envVar] = value
    }
  }

  return result
}

/** Test an extraction rule against the last response, returning the extracted value */
export function testExtraction(response: ResponseData, ex: ResponseExtraction): string | undefined {
  const results = runExtractions(response, [{ ...ex, enabled: true }])
  return results[ex.envVar]
}
