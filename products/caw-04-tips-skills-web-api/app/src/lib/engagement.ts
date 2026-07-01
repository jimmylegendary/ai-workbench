import type { Payload, Where } from 'payload'

export type EngType = 'skills' | 'tips' | 'news' | 'articles'

export interface EngState {
  likes: number
  favorites: number
  views: number
  likedByMe: boolean
  favoritedByMe: boolean
}

export const emptyEngState = (): EngState => ({
  likes: 0,
  favorites: 0,
  views: 0,
  likedByMe: false,
  favoritedByMe: false,
})

// A polymorphic relationship value serializes (depth 0) as { relationTo, value }.
const valueId = (item: unknown): string => {
  const v = (item as { value?: unknown })?.value
  if (v && typeof v === 'object') return String((v as { id?: unknown }).id ?? '')
  return String(v ?? '')
}
const relId = (rel: unknown): string =>
  rel && typeof rel === 'object' ? String((rel as { id?: unknown }).id ?? '') : String(rel ?? '')

const itemWhere = (relationTo: EngType, id: number | string): Where => ({
  and: [{ 'item.relationTo': { equals: relationTo } }, { 'item.value': { equals: id } }],
})

/** Aggregate engagement for a set of item ids of one type, in a few queries. */
export async function getEngagementMap(
  payload: Payload,
  relationTo: EngType,
  ids: (number | string)[],
  userId?: number | string | null,
): Promise<Map<string, EngState>> {
  const map = new Map<string, EngState>()
  ids.forEach((id) => map.set(String(id), emptyEngState()))
  if (ids.length === 0) return map

  const scope: Where = {
    and: [{ 'item.relationTo': { equals: relationTo } }, { 'item.value': { in: ids } }],
  }
  const [reactions, favorites, views] = await Promise.all([
    payload.find({
      collection: 'reactions',
      depth: 0,
      limit: 10000,
      where: { and: [...(scope.and as Where[]), { kind: { equals: 'like' } }] },
    }),
    payload.find({ collection: 'favorites', depth: 0, limit: 10000, where: scope }),
    payload.find({ collection: 'views', depth: 0, limit: 10000, where: scope }),
  ])

  const uid = userId != null ? String(userId) : null
  for (const r of reactions.docs) {
    const s = map.get(valueId(r.item))
    if (!s) continue
    s.likes++
    if (uid && relId(r.user) === uid) s.likedByMe = true
  }
  for (const f of favorites.docs) {
    const s = map.get(valueId(f.item))
    if (!s) continue
    s.favorites++
    if (uid && relId(f.user) === uid) s.favoritedByMe = true
  }
  for (const v of views.docs) {
    const s = map.get(valueId(v.item))
    if (s) s.views += (v as { count?: number }).count ?? 0
  }
  return map
}

export async function getEngagement(
  payload: Payload,
  relationTo: EngType,
  id: number | string,
  userId?: number | string | null,
): Promise<EngState> {
  const map = await getEngagementMap(payload, relationTo, [id], userId)
  return map.get(String(id)) ?? emptyEngState()
}

async function likeCount(payload: Payload, relationTo: EngType, id: number | string) {
  const { totalDocs } = await payload.count({
    collection: 'reactions',
    where: { and: [...(itemWhere(relationTo, id).and as Where[]), { kind: { equals: 'like' } }] },
  })
  return totalDocs
}

export async function toggleLike(
  payload: Payload,
  relationTo: EngType,
  id: number | string,
  userId: number | string,
): Promise<{ liked: boolean; likes: number }> {
  const existing = await payload.find({
    collection: 'reactions',
    depth: 0,
    limit: 1,
    where: {
      and: [
        { user: { equals: userId } },
        ...(itemWhere(relationTo, id).and as Where[]),
        { kind: { equals: 'like' } },
      ],
    },
  })
  let liked: boolean
  if (existing.docs.length) {
    await payload.delete({ collection: 'reactions', id: existing.docs[0].id })
    liked = false
  } else {
    await payload.create({
      collection: 'reactions',
      data: { user: userId, item: { relationTo, value: id }, kind: 'like' },
    })
    liked = true
  }
  return { liked, likes: await likeCount(payload, relationTo, id) }
}

export async function toggleFavorite(
  payload: Payload,
  relationTo: EngType,
  id: number | string,
  userId: number | string,
): Promise<{ favorited: boolean; favorites: number }> {
  const existing = await payload.find({
    collection: 'favorites',
    depth: 0,
    limit: 1,
    where: { and: [{ user: { equals: userId } }, ...(itemWhere(relationTo, id).and as Where[])] },
  })
  let favorited: boolean
  if (existing.docs.length) {
    await payload.delete({ collection: 'favorites', id: existing.docs[0].id })
    favorited = false
  } else {
    await payload.create({
      collection: 'favorites',
      data: { user: userId, item: { relationTo, value: id } },
    })
    favorited = true
  }
  const { totalDocs } = await payload.count({ collection: 'favorites', where: itemWhere(relationTo, id) })
  return { favorited, favorites: totalDocs }
}

export async function incrementView(
  payload: Payload,
  relationTo: EngType,
  id: number | string,
): Promise<number> {
  const existing = await payload.find({
    collection: 'views',
    depth: 0,
    limit: 1,
    where: itemWhere(relationTo, id),
  })
  if (existing.docs.length) {
    const row = existing.docs[0] as { id: number | string; count?: number }
    const count = (row.count ?? 0) + 1
    await payload.update({ collection: 'views', id: row.id, data: { count } })
    return count
  }
  const created = await payload.create({
    collection: 'views',
    data: { item: { relationTo, value: id }, count: 1 },
  })
  return (created as { count?: number }).count ?? 1
}
