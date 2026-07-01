import { getPayload } from 'payload'

import config from '@/payload.config'

export const dynamic = 'force-dynamic'

const SECTIONS: Array<[('skills' | 'tips' | 'news' | 'articles'), string]> = [
  ['skills', 'Skills'],
  ['tips', 'Tips'],
  ['news', 'News'],
  ['articles', 'Digests'],
]

// Markdown index for LLMs (llms.txt convention).
export async function GET(req: Request) {
  const payload = await getPayload({ config: await config })
  const origin = new URL(req.url).origin
  const lines: string[] = [
    '# CAW-04 — AI Tips & Skills',
    '',
    '> Internal knowledge base of AI skills, tips, news, and AI-curated digests.',
    '',
  ]
  for (const [type, label] of SECTIONS) {
    const { docs } = await payload.find({ collection: type, limit: 200, depth: 0, sort: '-updatedAt' })
    const rows = (docs as Array<{ slug?: string | null; title?: string; summary?: string | null }>)
      .filter((d) => d.slug)
      .map((d) => `- [${d.title}](${origin}/${type}/${d.slug})${d.summary ? `: ${d.summary}` : ''}`)
    if (!rows.length) continue
    lines.push(`## ${label}`, ...rows, '')
  }
  return new Response(lines.join('\n'), {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  })
}
