// Minimal lexical (Payload richText) -> plain-text paragraphs, for read-only rendering.
// (We author body as lexical in the admin and via a plaintext->lexical helper on the web.)
type LexNode = {
  type?: string
  text?: string
  children?: LexNode[]
}

const nodeText = (node: LexNode | undefined): string => {
  if (!node) return ''
  if (node.type === 'text') return node.text ?? ''
  if (Array.isArray(node.children)) return node.children.map(nodeText).join('')
  return ''
}

export function lexicalToParagraphs(body: unknown): string[] {
  const root = (body as { root?: LexNode })?.root
  const children = root?.children ?? []
  const paragraphs: string[] = []
  for (const child of children) {
    const text = nodeText(child).trim()
    if (text) paragraphs.push(text)
  }
  return paragraphs
}

// Build a minimal lexical document from plain text (one paragraph per line).
export function plaintextToLexical(text: string) {
  const lines = (text || '').split(/\r?\n/).filter((l) => l.trim().length > 0)
  const paragraphs = (lines.length ? lines : ['']).map((line) => ({
    type: 'paragraph',
    version: 1,
    direction: 'ltr' as const,
    format: '' as const,
    indent: 0,
    children: line
      ? [
          {
            type: 'text',
            version: 1,
            text: line,
            detail: 0,
            format: 0,
            mode: 'normal' as const,
            style: '',
          },
        ]
      : [],
  }))
  return {
    root: {
      type: 'root',
      version: 1,
      direction: 'ltr' as const,
      format: '' as const,
      indent: 0,
      children: paragraphs,
    },
  }
}
