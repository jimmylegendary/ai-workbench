import { RichText } from '@payloadcms/richtext-lexical/react'

import { lexicalToParagraphs } from '@/lib/lexical'

// Renders a lexical richText value with prose styling (headings/lists/code/links/bold).
export function RichBody({ body }: { body: unknown }) {
  if (!body || typeof body !== 'object') return null
  // Skip rendering an empty document.
  if (lexicalToParagraphs(body).length === 0) return null
  return (
    <div className="prose mt-6 max-w-none text-[16px] leading-[26px] [&_a]:text-[var(--color-link)] [&_a]:underline [&_code]:rounded [&_code]:bg-[var(--color-surface-muted)] [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[14px] [&_h2]:mt-6 [&_h2]:text-[26px] [&_h2]:font-semibold [&_h3]:mt-5 [&_h3]:text-[19px] [&_h3]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_ol_li]:list-decimal [&_p]:mb-3 [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-[var(--color-surface-muted)] [&_pre]:p-3 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-[var(--color-text-muted)]">
      <RichText data={body as never} />
    </div>
  )
}
