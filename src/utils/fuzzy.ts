/** Returns true if every character in `query` appears in `target` in order (case-insensitive). */
export function fuzzy(query: string, target: string): boolean {
  if (!query) return true
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  let qi = 0
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++
  }
  return qi === q.length
}

/** Score a match — lower is better. Exact prefix match scores 0, sequential chars score higher. */
export function fuzzyScore(query: string, target: string): number {
  if (!query) return 1
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  if (t.startsWith(q)) return 0
  if (t.includes(q)) return 1
  return 2
}
