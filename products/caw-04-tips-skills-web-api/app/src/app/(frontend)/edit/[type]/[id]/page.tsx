import { headers as nextHeaders } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { getPayload } from 'payload'

import config from '@/payload.config'
import { getDict } from '@/i18n/server'
import { lexicalToParagraphs } from '@/lib/lexical'
import { EditContentForm } from '@/components/create-content-form'
import { SiteHeader } from '@/components/site-header'

export const dynamic = 'force-dynamic'

const VALID = ['skills', 'tips', 'news'] as const

export default async function EditContentPage({
  params,
}: {
  params: Promise<{ type: string; id: string }>
}) {
  const { type, id } = await params
  if (!VALID.includes(type as (typeof VALID)[number])) notFound()
  const ct = type as 'skills' | 'tips' | 'news'

  const { locale, t } = await getDict()
  const payload = await getPayload({ config: await config })
  const { user } = await payload.auth({ headers: await nextHeaders() })
  if (!user) redirect('/login')

  let doc: Record<string, unknown> | null = null
  try {
    doc = (await payload.findByID({ collection: ct, id, depth: 0 })) as Record<string, unknown>
  } catch {
    notFound()
  }
  if (!doc) notFound()

  const roles = ((user.roles as string[] | undefined) ?? []) as string[]
  const isStaff = roles.some((r) => r === 'admin' || r === 'curator')
  const author = doc.author as { id?: number | string } | number | string | null | undefined
  const authorId = author && typeof author === 'object' ? author.id : author
  if (!isStaff && String(authorId) !== String(user.id)) redirect(`/${ct}/${doc.slug}`)

  const tags = ((doc.tags as Array<{ tag?: string | null }> | undefined) ?? [])
    .map((x) => x.tag)
    .filter(Boolean)
    .join(', ')

  const initial = {
    title: (doc.title as string) ?? '',
    summary: (doc.summary as string) ?? '',
    bodyText: lexicalToParagraphs(doc.body).join('\n'),
    tags,
    url: (doc.url as string) ?? '',
    source: (doc.source as string) ?? '',
  }

  return (
    <div className="min-h-dvh">
      <SiteHeader user={user} t={t} locale={locale} />
      <main className="mx-auto max-w-2xl px-6 py-10">
        <a
          href={`/${ct}/${doc.slug}`}
          className="text-sm text-[var(--color-text-muted)] hover:text-text"
        >
          ← {String(doc.title ?? '')}
        </a>
        <h1 className="mt-4 mb-6 text-[26px] font-semibold leading-[32px]">
          {t.create.edit} · {t.types[ct]}
        </h1>
        <EditContentForm type={ct} id={doc.id as number} slug={(doc.slug as string) ?? ''} initial={initial} t={t} />
      </main>
    </div>
  )
}
