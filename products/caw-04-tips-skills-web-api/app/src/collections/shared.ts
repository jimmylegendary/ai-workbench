import type { CollectionBeforeChangeHook, Field } from 'payload'
import { convertMarkdownToLexical, editorConfigFactory } from '@payloadcms/richtext-lexical'

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'item'

// Markdown is the authoring source (AI + web). The hook renders it into `body` (lexical).
export const bodyMarkdownField: Field = {
  name: 'bodyMarkdown',
  type: 'textarea',
  admin: { description: 'Markdown source — rendered into the rich body on save.' },
}

// Denormalized plain text for full-text-ish search (title + summary + body + tags).
export const searchTextField: Field = {
  name: 'searchText',
  type: 'textarea',
  index: true,
  admin: { hidden: true, readOnly: true },
}

// Shared beforeChange for skills/tips/news:
//  - auto-slug from title + default to DRAFT on create (no auto-publish)
//  - convert bodyMarkdown -> body (lexical) when provided
//  - maintain searchText from the merged doc
export const contentBeforeChange: CollectionBeforeChangeHook = async ({ data, req, operation, originalDoc }) => {
  if (operation === 'create') {
    if (!data.slug && data.title) data.slug = slugify(String(data.title))
    if (!data._status) data._status = 'draft'
  }

  if (typeof data.bodyMarkdown === 'string' && data.bodyMarkdown.trim()) {
    const editorConfig = await editorConfigFactory.default({ config: req.payload.config })
    data.body = convertMarkdownToLexical({ editorConfig, markdown: data.bodyMarkdown })
  }

  const merged = { ...(originalDoc ?? {}), ...data }
  const tags = Array.isArray(merged.tags)
    ? merged.tags.map((t: { tag?: string | null }) => t?.tag).filter(Boolean).join(' ')
    : ''
  data.searchText = [merged.title, merged.summary, merged.bodyMarkdown, tags]
    .filter(Boolean)
    .join('\n')

  return data
}
