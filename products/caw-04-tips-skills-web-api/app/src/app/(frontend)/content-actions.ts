'use server'

import { headers as nextHeaders } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getPayload } from 'payload'

import config from '@/payload.config'

const CREATABLE = ['skills', 'tips', 'news'] as const
type Creatable = (typeof CREATABLE)[number]

const listPath = (type: Creatable) => (type === 'skills' ? '/' : `/${type}`)

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'item'

export type CreateState = { error?: 'type' | 'auth' | 'title' | 'failed' }

export async function createContentAction(
  _prev: CreateState,
  formData: FormData,
): Promise<CreateState> {
  const type = String(formData.get('type') || '') as Creatable
  if (!CREATABLE.includes(type)) return { error: 'type' }

  const payload = await getPayload({ config: await config })
  const { user } = await payload.auth({ headers: await nextHeaders() })
  if (!user) return { error: 'auth' }

  const title = String(formData.get('title') || '').trim()
  if (!title) return { error: 'title' }

  const summary = String(formData.get('summary') || '').trim()
  const bodyText = String(formData.get('body') || '').trim()
  const tags = String(formData.get('tags') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((tag) => ({ tag }))

  let slug = slugify(title)
  const exists = await payload.find({
    collection: type,
    where: { slug: { equals: slug } },
    limit: 1,
    overrideAccess: true,
  })
  if (exists.docs.length) slug = `${slug}-${(exists.totalDocs + 1).toString(36)}${title.length}`

  const data: Record<string, unknown> = { title, slug, author: user.id }
  if (summary) data.summary = summary
  if (tags.length) data.tags = tags
  if (bodyText) data.bodyMarkdown = bodyText
  if (type === 'news') {
    const url = String(formData.get('url') || '').trim()
    const source = String(formData.get('source') || '').trim()
    if (url) data.url = url
    if (source) data.source = source
  }

  try {
    await payload.create({ collection: type, data, overrideAccess: false, user })
  } catch {
    return { error: 'failed' }
  }
  revalidatePath(listPath(type as Creatable))
  redirect(`/${type}/${slug}`)
}

export type UpdateState = { error?: 'auth' | 'title' | 'forbidden' }
export async function updateContentAction(
  _prev: UpdateState,
  formData: FormData,
): Promise<UpdateState> {
  const type = String(formData.get('type') || '') as Creatable
  const id = String(formData.get('id') || '')
  const slug = String(formData.get('slug') || '')
  if (!CREATABLE.includes(type) || !id) return { error: 'forbidden' }

  const payload = await getPayload({ config: await config })
  const { user } = await payload.auth({ headers: await nextHeaders() })
  if (!user) return { error: 'auth' }

  const title = String(formData.get('title') || '').trim()
  if (!title) return { error: 'title' }
  const summary = String(formData.get('summary') || '').trim()
  const bodyText = String(formData.get('body') || '').trim()
  const tags = String(formData.get('tags') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((tag) => ({ tag }))

  const data: Record<string, unknown> = { title, summary, tags, bodyMarkdown: bodyText }
  if (type === 'news') {
    data.url = String(formData.get('url') || '').trim()
    data.source = String(formData.get('source') || '').trim()
  }

  try {
    await payload.update({ collection: type, id, data, overrideAccess: false, user })
  } catch {
    return { error: 'forbidden' }
  }
  revalidatePath(listPath(type as Creatable))
  redirect(`/${type}/${slug}`)
}

export async function publishContentAction(type: string, id: number | string, slug: string) {
  await setStatus(type, id, 'published')
  redirect(`/${type}/${slug}`)
}

export async function unpublishContentAction(type: string, id: number | string, slug: string) {
  await setStatus(type, id, 'draft')
  redirect(`/${type}/${slug}`)
}

async function setStatus(type: string, id: number | string, status: 'published' | 'draft') {
  if (!CREATABLE.includes(type as Creatable)) return
  const payload = await getPayload({ config: await config })
  const { user } = await payload.auth({ headers: await nextHeaders() })
  if (!user) return
  try {
    await payload.update({
      collection: type as Creatable,
      id,
      data: { _status: status },
      overrideAccess: false,
      user,
    })
  } catch {
    return
  }
  revalidatePath(listPath(type as Creatable))
}

export async function deleteContentAction(type: string, id: number | string) {
  if (!CREATABLE.includes(type as Creatable)) return
  const payload = await getPayload({ config: await config })
  const { user } = await payload.auth({ headers: await nextHeaders() })
  if (!user) return
  try {
    await payload.delete({ collection: type as Creatable, id, overrideAccess: false, user })
  } catch {
    return
  }
  revalidatePath(listPath(type as Creatable))
  redirect(listPath(type as Creatable))
}
