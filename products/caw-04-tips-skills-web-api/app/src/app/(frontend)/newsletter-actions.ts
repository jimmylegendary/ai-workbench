'use server'

import { headers as nextHeaders } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getPayload } from 'payload'

import config from '@/payload.config'
import { generateDigest, sendDigest } from '@/lib/digest'

async function ctx() {
  const payload = await getPayload({ config: await config })
  const { user } = await payload.auth({ headers: await nextHeaders() })
  return { payload, user }
}

export async function toggleSubscriptionAction() {
  const { payload, user } = await ctx()
  if (!user) return
  const existing = await payload.find({
    collection: 'subscriptions',
    where: { user: { equals: user.id } },
    limit: 1,
  })
  if (existing.docs.length) {
    const sub = existing.docs[0]
    await payload.update({
      collection: 'subscriptions',
      id: sub.id,
      data: { active: !sub.active },
    })
  } else {
    await payload.create({
      collection: 'subscriptions',
      data: { user: user.id, email: user.email, active: true },
    })
  }
  revalidatePath('/me')
}

export async function runDigestAction() {
  const { payload, user } = await ctx()
  const roles = ((user?.roles as string[] | undefined) ?? []) as string[]
  if (!user || !roles.some((r) => r === 'admin' || r === 'curator')) return
  // Date is fine in a server action (request-time), not in workflow scripts.
  const dateStr = new Date().toISOString().slice(0, 10)
  const article = await generateDigest(payload, dateStr)
  await sendDigest(payload, article)
  redirect(`/articles/${article.slug}`)
}
