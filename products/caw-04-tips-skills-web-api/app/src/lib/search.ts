import type { Payload } from 'payload'

export type SearchType = 'skills' | 'tips' | 'news'
export const SEARCH_TYPES: SearchType[] = ['skills', 'tips', 'news']

export interface SearchHit {
  type: SearchType
  id: number | string
  title: string
  slug?: string | null
  summary?: string | null
}

// Shared by the /api/search endpoint (agents) and the /search page (web).
// v1 uses case-insensitive `like` (contains); upgrade to Postgres FTS / Meilisearch later.
export async function searchContent(
  payload: Payload,
  q: string,
  opts?: { types?: SearchType[]; limit?: number },
): Promise<SearchHit[]> {
  const term = (q || '').trim()
  if (!term) return []
  const types = opts?.types ?? SEARCH_TYPES
  const limit = opts?.limit ?? 20

  const perType = await Promise.all(
    types.map(async (type) => {
      const res = await payload.find({
        collection: type,
        depth: 0,
        limit,
        where: {
          and: [
            { _status: { equals: 'published' } },
            {
              or: [
                { title: { like: term } },
                { summary: { like: term } },
                { 'tags.tag': { like: term } },
                { searchText: { like: term } },
              ],
            },
          ],
        },
      })
      return res.docs.map(
        (d): SearchHit => ({
          type,
          id: (d as { id: number | string }).id,
          title: (d as { title?: string }).title ?? '(untitled)',
          slug: (d as { slug?: string | null }).slug ?? null,
          summary: (d as { summary?: string | null }).summary ?? null,
        }),
      )
    }),
  )
  return perType.flat().slice(0, limit)
}
