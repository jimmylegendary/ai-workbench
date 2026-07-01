import { headers as nextHeaders } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { getPayload } from 'payload'

import config from '@/payload.config'
import { getDict } from '@/i18n/server'
import { CreateContentForm } from '@/components/create-content-form'
import { SiteHeader } from '@/components/site-header'

export const dynamic = 'force-dynamic'

const VALID = ['skills', 'tips', 'news'] as const

export default async function NewContentPage({
  params,
}: {
  params: Promise<{ type: string }>
}) {
  const { type } = await params
  if (!VALID.includes(type as (typeof VALID)[number])) notFound()
  const contentType = type as 'skills' | 'tips' | 'news'

  const { locale, t } = await getDict()
  const payload = await getPayload({ config: await config })
  const { user } = await payload.auth({ headers: await nextHeaders() })
  if (!user) redirect('/login')

  return (
    <div className="min-h-dvh">
      <SiteHeader user={user} t={t} locale={locale} />
      <main className="mx-auto max-w-2xl px-6 py-10">
        <a href="/new" className="text-sm text-[var(--color-text-muted)] hover:text-text">
          ← {t.create.new}
        </a>
        <h1 className="mt-4 mb-6 text-[26px] font-semibold leading-[32px]">
          {t.create.new} · {t.types[contentType]}
        </h1>
        <CreateContentForm type={contentType} t={t} />
      </main>
    </div>
  )
}
