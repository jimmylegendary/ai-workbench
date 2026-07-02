import { headers as nextHeaders } from 'next/headers'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'

import config from '@/payload.config'
import { getEngagement } from '@/lib/engagement'
import { getDict } from '@/i18n/server'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { RichBody } from '@/components/rich-body'
import { EngagementBar } from '@/components/engagement-bar'
import { OwnerControls, canEditDoc } from '@/components/owner-controls'
import { SiteHeader } from '@/components/site-header'
import { ViewPing } from '@/components/view-ping'

export const dynamic = 'force-dynamic'

export default async function NewsDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const { locale, t } = await getDict()
  const payload = await getPayload({ config: await config })
  const { user } = await payload.auth({ headers: await nextHeaders() })
  const { docs } = await payload.find({
    collection: 'news',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 0,
    draft: true,
  })
  const item = docs[0]
  if (!item) notFound()
  const canEdit = canEditDoc(user, item)
  if (item._status !== 'published' && !canEdit) notFound()

  const eng = await getEngagement(payload, 'news', item.id, user?.id)

  return (
    <div className="min-h-dvh">
      <SiteHeader user={user} t={t} locale={locale} active="news" />
      <ViewPing relationTo="news" id={item.id} />
      <main className="mx-auto max-w-3xl px-6 py-10">
        <a href="/news" className="text-sm text-[var(--color-text-muted)] hover:text-text">
          ← {t.nav.news}
        </a>
        <OwnerControls
          type="news"
          id={item.id}
          slug={item.slug ?? ''}
          status={item._status}
          canEdit={canEdit}
          t={t}
        />
        <div className="mt-4 mb-2 flex items-start justify-between gap-3">
          <h1 className="text-[36px] font-bold leading-[42px] tracking-tight">{item.title}</h1>
          {item._status !== 'published' ? <Badge variant="outline">{t.skill.draft}</Badge> : null}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--color-text-muted)]">
          {item.source ? (
            <span>
              {t.newsPage.source}: {item.source}
            </span>
          ) : null}
          {item.publishedAt ? (
            <span>{new Date(item.publishedAt).toISOString().slice(0, 10)}</span>
          ) : null}
        </div>
        {item.summary ? <p className="mt-3 text-[var(--color-text-muted)]">{item.summary}</p> : null}
        {item.url ? (
          <a href={item.url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block">
            <Button size="sm" variant="outline">
              {t.newsPage.visit} ↗
            </Button>
          </a>
        ) : null}
        {item.tags && item.tags.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {item.tags.map((tag, i) => (
              <Badge key={i} variant="accent">
                {tag.tag}
              </Badge>
            ))}
          </div>
        ) : null}
        <div className="mt-6 border-y border-border py-3">
          <EngagementBar relationTo="news" id={item.id} initial={eng} canInteract={Boolean(user)} />
        </div>
        <RichBody body={item.body} />
      </main>
    </div>
  )
}
