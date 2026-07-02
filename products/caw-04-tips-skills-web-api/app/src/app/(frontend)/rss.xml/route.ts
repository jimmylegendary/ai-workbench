import { getPayload } from 'payload'

import config from '@/payload.config'

export const dynamic = 'force-dynamic'

const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

// RSS 2.0 feed of News + AI-curated Digests.
export async function GET(req: Request) {
  const payload = await getPayload({ config: await config })
  const origin = new URL(req.url).origin
  const pub = { _status: { equals: 'published' } }
  const [news, articles] = await Promise.all([
    payload.find({ collection: 'news', limit: 30, depth: 0, sort: '-updatedAt', where: pub }),
    payload.find({ collection: 'articles', limit: 30, depth: 0, sort: '-publishedAt', where: pub }),
  ])
  const entries = [
    ...news.docs.map((d) => ({ type: 'news', d })),
    ...articles.docs.map((d) => ({ type: 'articles', d })),
  ] as Array<{ type: string; d: { slug?: string | null; title?: string; summary?: string | null } }>

  const items = entries
    .filter((e) => e.d.slug)
    .map(
      ({ type, d }) =>
        `<item><title>${esc(d.title)}</title><link>${origin}/${type}/${d.slug}</link>` +
        `<guid>${origin}/${type}/${d.slug}</guid><description>${esc(d.summary)}</description></item>`,
    )
    .join('')

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<rss version="2.0"><channel>` +
    `<title>CAW-04 — AI Tips &amp; Skills</title>` +
    `<link>${origin}</link>` +
    `<description>AI news and curated digests</description>` +
    items +
    `</channel></rss>`

  return new Response(xml, {
    headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'no-store' },
  })
}
