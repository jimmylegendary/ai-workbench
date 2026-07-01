'use server'

import { cookies, headers as nextHeaders } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { getPayload } from 'payload'

import config from '@/payload.config'
import {
  incrementView,
  toggleFavorite,
  toggleLike,
  type EngType,
} from '@/lib/engagement'

async function ctx() {
  const payload = await getPayload({ config: await config })
  const { user } = await payload.auth({ headers: await nextHeaders() })
  return { payload, user }
}

export async function likeAction(relationTo: EngType, id: number) {
  const { payload, user } = await ctx()
  if (!user) return { ok: false as const, reason: 'auth' as const }
  const res = await toggleLike(payload, relationTo, id, user.id)
  revalidatePath('/')
  return { ok: true as const, ...res }
}

export async function favoriteAction(relationTo: EngType, id: number) {
  const { payload, user } = await ctx()
  if (!user) return { ok: false as const, reason: 'auth' as const }
  const res = await toggleFavorite(payload, relationTo, id, user.id)
  revalidatePath('/')
  return { ok: true as const, ...res }
}

export async function viewAction(relationTo: EngType, id: number) {
  // Dedup: only count one view per (viewer, item) within the cookie window.
  const store = await cookies()
  const key = `${relationTo}:${id}`
  const raw = store.get('caw04_views')?.value ?? ''
  const seen = raw ? raw.split(',') : []
  if (seen.includes(key)) return { ok: true as const, deduped: true as const }

  const { payload } = await ctx()
  const views = await incrementView(payload, relationTo, id)
  store.set('caw04_views', [...seen, key].slice(-200).join(','), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 12, // 12h
  })
  return { ok: true as const, views }
}
