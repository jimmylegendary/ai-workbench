'use server'

import { headers as nextHeaders } from 'next/headers'
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
  const { payload } = await ctx()
  const views = await incrementView(payload, relationTo, id)
  return { ok: true as const, views }
}
