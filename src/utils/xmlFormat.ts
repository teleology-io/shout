/** Pretty-print an XML string with indentation. */
export function formatXml(xml: string): string {
  let formatted = ''
  let indent = 0
  const tab = '  '

  // Normalize — strip existing indent/newlines between tags
  const normalized = xml.trim().replace(/>\s*</g, '><')

  // Split on tag boundaries while keeping the delimiters
  const tokens = normalized.split(/(<[^>]+>)/)

  for (const token of tokens) {
    if (!token.trim()) continue

    if (token.startsWith('</')) {
      // Closing tag — dedent first
      indent = Math.max(0, indent - 1)
      formatted += tab.repeat(indent) + token + '\n'
    } else if (token.startsWith('<?') || token.startsWith('<!')) {
      // Processing instruction / doctype / comment
      formatted += tab.repeat(indent) + token + '\n'
    } else if (token.startsWith('<') && !token.endsWith('/>')) {
      // Opening tag — add then indent
      formatted += tab.repeat(indent) + token + '\n'
      indent++
    } else if (token.startsWith('<') && token.endsWith('/>')) {
      // Self-closing tag
      formatted += tab.repeat(indent) + token + '\n'
    } else {
      // Text node
      const text = token.trim()
      if (text) formatted += tab.repeat(indent) + text + '\n'
    }
  }

  return formatted.trimEnd()
}

/** Check if a string looks like XML. */
export function looksLikeXml(text: string): boolean {
  const trimmed = text.trim()
  return trimmed.startsWith('<') && trimmed.includes('>')
}

export interface XmlToken {
  type: 'tag' | 'attr-name' | 'attr-value' | 'text' | 'comment' | 'pi' | 'cdata' | 'punct'
  value: string
}

/** Tokenize XML for syntax highlighting. */
export function tokenizeXml(xml: string): XmlToken[] {
  const tokens: XmlToken[] = []
  let i = 0
  const len = xml.length

  while (i < len) {
    if (xml[i] === '<') {
      if (xml.startsWith('<!--', i)) {
        // Comment
        const end = xml.indexOf('-->', i + 4)
        const close = end >= 0 ? end + 3 : len
        tokens.push({ type: 'comment', value: xml.slice(i, close) })
        i = close
      } else if (xml.startsWith('<![CDATA[', i)) {
        const end = xml.indexOf(']]>', i + 9)
        const close = end >= 0 ? end + 3 : len
        tokens.push({ type: 'cdata', value: xml.slice(i, close) })
        i = close
      } else if (xml.startsWith('<?', i)) {
        const end = xml.indexOf('?>', i + 2)
        const close = end >= 0 ? end + 2 : len
        tokens.push({ type: 'pi', value: xml.slice(i, close) })
        i = close
      } else {
        // Regular tag
        const end = xml.indexOf('>', i)
        const close = end >= 0 ? end + 1 : len
        const raw = xml.slice(i, close)
        tokenizeTag(raw, tokens)
        i = close
      }
    } else {
      // Text node
      const next = xml.indexOf('<', i)
      const end = next >= 0 ? next : len
      const text = xml.slice(i, end)
      if (text.trim()) tokens.push({ type: 'text', value: text })
      else tokens.push({ type: 'punct', value: text })
      i = end
    }
  }

  return tokens
}

function tokenizeTag(raw: string, tokens: XmlToken[]) {
  // raw = "<tagName attr="val" />" or "</tagName>"
  const isClose = raw.startsWith('</')
  const isSelf = raw.endsWith('/>')

  tokens.push({ type: 'punct', value: isClose ? '</' : '<' })

  const inner = raw.slice(isClose ? 2 : 1, isSelf ? raw.length - 2 : raw.length - 1)
  // First word = tag name
  const spaceIdx = inner.search(/\s/)
  const tagName = spaceIdx >= 0 ? inner.slice(0, spaceIdx) : inner
  tokens.push({ type: 'tag', value: tagName })

  if (spaceIdx >= 0) {
    // Parse attributes
    const attrStr = inner.slice(spaceIdx)
    const attrRe = /\s+([\w:-]+)(?:=("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'))?/g
    let m
    let lastIdx = spaceIdx
    while ((m = attrRe.exec(inner)) !== null) {
      const before = inner.slice(lastIdx, m.index + 1)
      if (before.trim()) tokens.push({ type: 'text', value: before })
      else tokens.push({ type: 'punct', value: before })
      tokens.push({ type: 'attr-name', value: m[1] })
      if (m[2]) {
        tokens.push({ type: 'punct', value: '=' })
        tokens.push({ type: 'attr-value', value: m[2] })
      }
      lastIdx = m.index + m[0].length
    }
    void attrStr
  }

  tokens.push({ type: 'punct', value: isSelf ? '/>' : '>' })
}

export const XML_TOKEN_COLORS: Record<XmlToken['type'], string> = {
  tag: '#61affe',
  'attr-name': '#f92672',
  'attr-value': '#a6e22e',
  text: '#f8f8f2',
  comment: '#75715e',
  pi: '#75715e',
  cdata: '#e6db74',
  punct: '#f8f8f2',
}
