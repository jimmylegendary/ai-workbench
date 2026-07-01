import { headers as nextHeaders } from 'next/headers'
import { getPayload } from 'payload'

import config from '@/payload.config'
import { emptyEngState, getEngagementMap } from '@/lib/engagement'
import { getDict } from '@/i18n/server'
import { Badge } from '@/components/ui/badge'
import { ContentCard } from '@/components/content-card'
import { Pager } from '@/components/pager'
import { SiteHeader } from '@/components/site-header'

export const dynamic = 'force-dynamic'

export default async function ArticlesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const { page: pageStr } = await searchParams
  const page = Math.max(1, Number(pageStr) || 1)
  const { locale, t } = await getDict()
  const payload = await getPayload({ config: await config })
  const { user } = await payload.auth({ headers: await nextHeaders() })
  const result = await payload.find({
    collection: 'articles',
    limit: 12,
    page,
    depth: 0,
    sort: '-publishedAt',
  })
  const docs = result.docs
  const eng = await getEngagementMap(payload, 'articles', docs.map((d) => d.id), user?.id)

  return (
    <div className="min-h-dvh">
      <SiteHeader user={user} t={t} locale={locale} active="articles" />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-[36px] font-bold leading-[42px] tracking-tight">
            {t.articlesPage.title}
          </h1>
          <p className="mt-1 text-[var(--color-text-muted)]">{t.articlesPage.subtitle}</p>
        </div>
        {docs.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">{t.dashboard.empty}</p>
        ) : (
          <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {docs.map((d) => (
              <ContentCard
                key={d.id}
                type="articles"
                id={d.id}
                slug={d.slug}
                title={d.title}
                summary={d.summary}
                badge={
                  <div className="flex shrink-0 gap-1">
                    {d.generatedBy === 'ai' ? <Badge>{t.articlesPage.ai}</Badge> : null}
                    {d.sentAsNewsletter ? (
                      <Badge variant="public">{t.articlesPage.sent}</Badge>
                    ) : null}
                  </div>
                }
                eng={eng.get(String(d.id)) ?? emptyEngState()}
                canInteract={Boolean(user)}
                viewLabel={t.home.view}
              />
            ))}
          </div>
          <Pager basePath="/articles" page={page} totalPages={result.totalPages} />
          </>
        )}
      </main>
    </div>
  )
}
