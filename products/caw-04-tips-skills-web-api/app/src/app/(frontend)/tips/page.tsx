import { headers as nextHeaders } from 'next/headers'
import { getPayload } from 'payload'

import config from '@/payload.config'
import { emptyEngState, getEngagementMap } from '@/lib/engagement'
import { getDict } from '@/i18n/server'
import { ContentCard } from '@/components/content-card'
import { SiteHeader } from '@/components/site-header'

export const dynamic = 'force-dynamic'

export default async function TipsPage() {
  const { locale, t } = await getDict()
  const payload = await getPayload({ config: await config })
  const { user } = await payload.auth({ headers: await nextHeaders() })
  const { docs } = await payload.find({ collection: 'tips', limit: 24, depth: 0, sort: '-updatedAt' })
  const eng = await getEngagementMap(payload, 'tips', docs.map((d) => d.id), user?.id)

  return (
    <div className="min-h-dvh">
      <SiteHeader user={user} t={t} locale={locale} active="tips" />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-[36px] font-bold leading-[42px] tracking-tight">{t.tipsPage.title}</h1>
          <p className="mt-1 text-[var(--color-text-muted)]">{t.tipsPage.subtitle}</p>
        </div>
        {docs.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">{t.dashboard.empty}</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {docs.map((d) => (
              <ContentCard
                key={d.id}
                type="tips"
                id={d.id}
                slug={d.slug}
                title={d.title}
                summary={d.summary}
                tags={d.tags}
                eng={eng.get(String(d.id)) ?? emptyEngState()}
                canInteract={Boolean(user)}
                viewLabel={t.home.view}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
