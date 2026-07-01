import { headers as nextHeaders } from 'next/headers'
import { getPayload } from 'payload'

import config from '@/payload.config'
import { emptyEngState, getEngagementMap } from '@/lib/engagement'
import { getDict } from '@/i18n/server'
import { ContentCard } from '@/components/content-card'
import { SiteHeader } from '@/components/site-header'

export const dynamic = 'force-dynamic'

export default async function NewsPage() {
  const { locale, t } = await getDict()
  const payload = await getPayload({ config: await config })
  const { user } = await payload.auth({ headers: await nextHeaders() })
  const { docs } = await payload.find({ collection: 'news', limit: 24, depth: 0, sort: '-updatedAt' })
  const eng = await getEngagementMap(payload, 'news', docs.map((d) => d.id), user?.id)

  return (
    <div className="min-h-dvh">
      <SiteHeader user={user} t={t} locale={locale} active="news" />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-[36px] font-bold leading-[42px] tracking-tight">{t.newsPage.title}</h1>
          <p className="mt-1 text-[var(--color-text-muted)]">{t.newsPage.subtitle}</p>
        </div>
        {docs.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">{t.dashboard.empty}</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {docs.map((d) => (
              <ContentCard
                key={d.id}
                type="news"
                id={d.id}
                slug={d.slug}
                title={d.title}
                summary={d.summary}
                tags={d.tags}
                extra={
                  d.source ? (
                    <div className="mb-2 text-xs text-[var(--color-text-muted)]">
                      {t.newsPage.source}: {d.source}
                    </div>
                  ) : null
                }
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
