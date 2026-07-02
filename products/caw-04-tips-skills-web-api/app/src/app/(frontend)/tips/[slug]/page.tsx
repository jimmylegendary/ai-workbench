import { headers as nextHeaders } from 'next/headers'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'

import config from '@/payload.config'
import { getEngagement } from '@/lib/engagement'
import { getDict } from '@/i18n/server'
import { Badge } from '@/components/ui/badge'
import { RichBody } from '@/components/rich-body'
import { EngagementBar } from '@/components/engagement-bar'
import { OwnerControls, canEditDoc } from '@/components/owner-controls'
import { SiteHeader } from '@/components/site-header'
import { ViewPing } from '@/components/view-ping'

export const dynamic = 'force-dynamic'

export default async function TipDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const { locale, t } = await getDict()
  const payload = await getPayload({ config: await config })
  const { user } = await payload.auth({ headers: await nextHeaders() })
  const { docs } = await payload.find({
    collection: 'tips',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 0,
    draft: true,
  })
  const tip = docs[0]
  if (!tip) notFound()
  const canEdit = canEditDoc(user, tip)
  if (tip._status !== 'published' && !canEdit) notFound()

  const eng = await getEngagement(payload, 'tips', tip.id, user?.id)

  return (
    <div className="min-h-dvh">
      <SiteHeader user={user} t={t} locale={locale} active="tips" />
      <ViewPing relationTo="tips" id={tip.id} />
      <main className="mx-auto max-w-3xl px-6 py-10">
        <a href="/tips" className="text-sm text-[var(--color-text-muted)] hover:text-text">
          ← {t.nav.tips}
        </a>
        <OwnerControls
          type="tips"
          id={tip.id}
          slug={tip.slug ?? ''}
          status={tip._status}
          canEdit={canEdit}
          t={t}
        />
        <div className="mt-4 mb-2 flex items-start justify-between gap-3">
          <h1 className="text-[36px] font-bold leading-[42px] tracking-tight">{tip.title}</h1>
          {tip._status !== 'published' ? <Badge variant="outline">{t.skill.draft}</Badge> : null}
        </div>
        {tip.summary ? <p className="mt-2 text-[var(--color-text-muted)]">{tip.summary}</p> : null}
        {tip.tags && tip.tags.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {tip.tags.map((tag, i) => (
              <Badge key={i} variant="accent">
                {tag.tag}
              </Badge>
            ))}
          </div>
        ) : null}
        <div className="mt-6 border-y border-border py-3">
          <EngagementBar relationTo="tips" id={tip.id} initial={eng} canInteract={Boolean(user)} />
        </div>
        <RichBody body={tip.body} />
      </main>
    </div>
  )
}
