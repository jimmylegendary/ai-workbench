import { getPayload } from 'payload'

import config from '@/payload.config'

export const dynamic = 'force-dynamic'

const TYPES = ['skills', 'tips', 'news', 'articles'] as const

// Catalog manifest for agents/crawlers (discovery entry point).
export async function GET(req: Request) {
  const payload = await getPayload({ config: await config })
  const origin = new URL(req.url).origin
  const items: unknown[] = []
  for (const type of TYPES) {
    const { docs } = await payload.find({
      collection: type,
      limit: 1000,
      depth: 0,
      sort: '-updatedAt',
      where: { _status: { equals: 'published' } },
    })
    for (const d of docs as Array<{ id: number | string; slug?: string | null; title?: string; summary?: string | null }>) {
      items.push({
        type,
        id: d.id,
        slug: d.slug ?? null,
        title: d.title ?? null,
        summary: d.summary ?? null,
        html: d.slug ? `${origin}/${type}/${d.slug}` : null,
        json: `${origin}/api/${type}/${d.id}`,
      })
    }
  }
  return Response.json(
    { generatedAt: new Date().toISOString(), count: items.length, items },
    { headers: { 'cache-control': 'no-store' } },
  )
}
