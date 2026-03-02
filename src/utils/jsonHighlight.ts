export type TokenType = 'key' | 'string' | 'number' | 'boolean' | 'null' | 'punct' | 'other'
export interface Token { type: TokenType; value: string }

export const TOKEN_COLORS: Record<TokenType, string> = {
  key: '#9cdcfe',
  string: '#ce9178',
  number: '#b5cea8',
  boolean: '#569cd6',
  null: '#569cd6',
  punct: 'hsl(var(--muted-foreground))',
  other: 'hsl(var(--foreground))',
}

export function tokenizeJson(text: string): Token[] {
  const tokens: Token[] = []
  const re = /("(?:[^"\\]|\\.)*")\s*:|(")(?:[^"\\]|\\.)*"|(true|false|null)|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([{}\[\],:])|(\s+)/g
  let last = 0, m: RegExpExecArray | null

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) tokens.push({ type: 'other', value: text.slice(last, m.index) })
    if (m[1] !== undefined) {
      tokens.push({ type: 'key', value: m[1] })
      const rest = m[0].slice(m[1].length)
      if (rest) tokens.push({ type: 'punct', value: rest })
    } else if (m[2] !== undefined) {
      tokens.push({ type: 'string', value: m[0] })
    } else if (m[3] !== undefined) {
      tokens.push({ type: m[3] === 'null' ? 'null' : 'boolean', value: m[3] })
    } else if (m[4] !== undefined) {
      tokens.push({ type: 'number', value: m[4] })
    } else if (m[5] !== undefined) {
      tokens.push({ type: 'punct', value: m[5] })
    } else {
      tokens.push({ type: 'other', value: m[0] })
    }
    last = re.lastIndex
  }

  if (last < text.length) tokens.push({ type: 'other', value: text.slice(last) })
  return tokens
}
