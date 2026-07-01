import type { Payload } from 'payload'

export type ContentType = 'skills' | 'tips' | 'news' | 'articles'

export interface ActivityItem {
  type: ContentType
  id: number | string
  title: string
  slug?: string | null
  summary?: string | null
}

const toItem = (type: ContentType, doc: Record<string, unknown>): ActivityItem => ({
  type,
  id: doc.id as number | string,
  title: (doc.title as string) ?? '(untitled)',
  slug: (doc.slug as string) ?? null,
  summary: (doc.summary as string) ?? null,
})

// Resolve depth:1 polymorphic { relationTo, value: doc } rows into ActivityItems.
const resolveItems = (rows: Array<Record<string, unknown>>): ActivityItem[] =>
  rows
    .map((row) => {
      const item = row.item as { relationTo?: ContentType; value?: unknown } | undefined
      if (!item?.relationTo || !item.value || typeof item.value !== 'object') return null
      return toItem(item.relationTo, item.value as Record<string, unknown>)
    })
    .filter((v): v is ActivityItem => v !== null)

export async function getMyActivity(payload: Payload, userId: number | string) {
  const [skills, tips, news, favorites, likes] = await Promise.all([
    payload.find({ collection: 'skills', where: { author: { equals: userId } }, depth: 0, limit: 50, sort: '-updatedAt' }),
    payload.find({ collection: 'tips', where: { author: { equals: userId } }, depth: 0, limit: 50, sort: '-updatedAt' }),
    payload.find({ collection: 'news', where: { author: { equals: userId } }, depth: 0, limit: 50, sort: '-updatedAt' }),
    payload.find({ collection: 'favorites', where: { user: { equals: userId } }, depth: 1, limit: 100, sort: '-createdAt' }),
    payload.find({
      collection: 'reactions',
      where: { and: [{ user: { equals: userId } }, { kind: { equals: 'like' } }] },
      depth: 1,
      limit: 100,
      sort: '-createdAt',
    }),
  ])

  const submissions: ActivityItem[] = [
    ...skills.docs.map((d) => toItem('skills', d as Record<string, unknown>)),
    ...tips.docs.map((d) => toItem('tips', d as Record<string, unknown>)),
    ...news.docs.map((d) => toItem('news', d as Record<string, unknown>)),
  ]

  return {
    submissions,
    favorites: resolveItems(favorites.docs as Array<Record<string, unknown>>),
    likes: resolveItems(likes.docs as Array<Record<string, unknown>>),
  }
}
