import { headers as nextHeaders } from 'next/headers'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'

import config from '@/payload.config'
import { getEngagement } from '@/lib/engagement'
import { getDict } from '@/i18n/server'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { RichBody } from '@/components/rich-body'
import { EngagementBar } from '@/components/engagement-bar'
import { SiteHeader } from '@/components/site-header'
import { ViewPing } from '@/components/view-ping'

export const dynamic = 'force-dynamic'

type CuratedRef = {
  relationTo: 'skills' | 'tips' | 'news'
  value: number | string | { slug?: string | null; title?: string | null }
}

export default async function ArticleDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const { locale, t } = await getDict()
  const payload = await getPayload({ config: await config })
  const { user } = await payload.auth({ headers: await nextHeaders() })
  const { docs } = await payload.find({
    collection: 'articles',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 1,
  })
  const article = docs[0]
  if (!article) notFound()

  const eng = await getEngagement(payload, 'articles', article.id, user?.id)
  const curated = (article.curatedItems ?? []) as CuratedRef[]

  return (
    <div className="min-h-dvh">
      <SiteHeader user={user} t={t} locale={locale} active="articles" />
      <ViewPing relationTo="articles" id={article.id} />
      <main className="mx-auto max-w-3xl px-6 py-10">
        <a href="/articles" className="text-sm text-[var(--color-text-muted)] hover:text-text">
          ← {t.nav.digest}
        </a>
        <div className="mt-4 mb-2 flex items-start justify-between gap-3">
          <h1 className="text-[36px] font-bold leading-[42px] tracking-tight">{article.title}</h1>
          <div className="flex shrink-0 gap-1">
            {article.generatedBy === 'ai' ? <Badge>{t.articlesPage.ai}</Badge> : null}
            {article.sentAsNewsletter ? (
              <Badge variant="public">{t.articlesPage.sent}</Badge>
            ) : null}
          </div>
        </div>
        {article.publishedAt ? (
          <p className="text-sm text-[var(--color-text-muted)]">
            {new Date(article.publishedAt).toISOString().slice(0, 10)}
          </p>
        ) : null}

        <div className="mt-6 border-y border-border py-3">
          <EngagementBar
            relationTo="articles"
            id={article.id}
            initial={eng}
            canInteract={Boolean(user)}
          />
        </div>

        <RichBody body={article.body} />

        {curated.length > 0 ? (
          <section className="mt-8">
            <h2 className="mb-3 text-[19px] font-semibold">{t.articlesPage.curated}</h2>
            <div className="space-y-2">
              {curated.map((ci, i) => {
                const v = ci.value
                if (!v || typeof v !== 'object') return null
                return (
                  <a key={i} href={`/${ci.relationTo}/${v.slug}`} className="block">
                    <Card className="flex items-center gap-3 p-3">
                      <Badge variant="outline">{t.types[ci.relationTo]}</Badge>
                      <span className="truncate font-medium">{v.title}</span>
                    </Card>
                  </a>
                )
              })}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  )
}
