import { headers as nextHeaders } from 'next/headers'
import { getPayload } from 'payload'
import type { Where } from 'payload'

import config from '@/payload.config'
import { emptyEngState, getEngagementMap } from '@/lib/engagement'
import { getDict } from '@/i18n/server'
import { ContentCard } from '@/components/content-card'
import { Pager } from '@/components/pager'
import { SiteHeader } from '@/components/site-header'

export const dynamic = 'force-dynamic'

export default async function NewsPage({
  searchParams,
}: {
  searchParams: Promise<{ tag?: string; page?: string }>
}) {
  const { tag, page: pageStr } = await searchParams
  const page = Math.max(1, Number(pageStr) || 1)
  const { locale, t } = await getDict()
  const payload = await getPayload({ config: await config })
  const { user } = await payload.auth({ headers: await nextHeaders() })

  const where: Where = {
    and: [{ _status: { equals: 'published' } }, ...(tag ? [{ 'tags.tag': { equals: tag } }] : [])],
  }
  const result = await payload.find({ collection: 'news', limit: 12, page, depth: 0, sort: '-updatedAt', where })
  const eng = await getEngagementMap(payload, 'news', result.docs.map((d) => d.id), user?.id)

  return (
    <div className="min-h-dvh">
      <SiteHeader user={user} t={t} locale={locale} active="news" />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-[36px] font-bold leading-[42px] tracking-tight">{t.newsPage.title}</h1>
          <p className="mt-1 text-[var(--color-text-muted)]">{t.newsPage.subtitle}</p>
          {tag ? (
            <a href="/news" className="mt-3 inline-flex items-center gap-1 text-sm text-[var(--color-primary)]">
              #{tag} <span className="text-[var(--color-text-muted)]">✕</span>
            </a>
          ) : null}
        </div>
        {result.docs.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">{t.dashboard.empty}</p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {result.docs.map((d) => (
                <ContentCard
                  key={d.id}
                  type="news"
                  id={d.id}
                  slug={d.slug}
                  title={d.title}
                  summary={d.summary}
                  tags={d.tags}
                  tagBase="/news"
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
            <Pager basePath="/news" page={page} totalPages={result.totalPages} params={{ tag }} />
          </>
        )}
      </main>
    </div>
  )
}
