import { headers as nextHeaders } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'

import config from '@/payload.config'
import { getDict } from '@/i18n/server'
import { Card } from '@/components/ui/card'
import { SiteHeader } from '@/components/site-header'

export const dynamic = 'force-dynamic'

export default async function NewChooserPage() {
  const { locale, t } = await getDict()
  const payload = await getPayload({ config: await config })
  const { user } = await payload.auth({ headers: await nextHeaders() })
  if (!user) redirect('/login')

  const options: Array<['skills' | 'tips' | 'news', string]> = [
    ['skills', t.types.skills],
    ['tips', t.types.tips],
    ['news', t.types.news],
  ]

  return (
    <div className="min-h-dvh">
      <SiteHeader user={user} t={t} locale={locale} />
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-[36px] font-bold leading-[42px] tracking-tight">{t.create.new}</h1>
        <p className="mt-1 text-[var(--color-text-muted)]">{t.create.choose}</p>
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {options.map(([slug, label]) => (
            <a key={slug} href={`/new/${slug}`}>
              <Card className="text-center font-medium hover:shadow-md">{label}</Card>
            </a>
          ))}
        </div>
      </main>
    </div>
  )
}
