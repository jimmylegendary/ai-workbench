import { headers as nextHeaders } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'

import config from '@/payload.config'
import { getDict } from '@/i18n/server'
import type { Dictionary } from '@/i18n/dictionaries'
import { getMyActivity, type ActivityItem } from '@/lib/activity'
import { runDigestAction, toggleSubscriptionAction } from '@/app/(frontend)/newsletter-actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { SiteHeader } from '@/components/site-header'

export const dynamic = 'force-dynamic'

export default async function MePage() {
  const { locale, t } = await getDict()
  const payload = await getPayload({ config: await config })
  const { user } = await payload.auth({ headers: await nextHeaders() })
  if (!user) redirect('/login')

  const { submissions, favorites, likes } = await getMyActivity(payload, user.id)

  const subRes = await payload.find({
    collection: 'subscriptions',
    where: { user: { equals: user.id } },
    limit: 1,
  })
  const subscribed = Boolean(subRes.docs[0]?.active)
  const roles = ((user.roles as string[] | undefined) ?? []) as string[]
  const canRunDigest = roles.some((r) => r === 'admin' || r === 'curator')

  return (
    <div className="min-h-dvh">
      <SiteHeader user={user} t={t} locale={locale} active="me" />

      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-[36px] font-bold leading-[42px] tracking-tight">
            {t.dashboard.title}
          </h1>
          <p className="mt-1 text-[var(--color-text-muted)]">{t.dashboard.subtitle}</p>
        </div>

        <Card className="mb-10 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-[19px] font-semibold leading-[26px]">{t.newsletter.title}</h2>
            <p className="text-sm text-[var(--color-text-muted)]">{t.newsletter.desc}</p>
          </div>
          <div className="flex items-center gap-2">
            {canRunDigest ? (
              <form action={runDigestAction}>
                <Button type="submit" size="sm" variant="ghost">
                  {t.newsletter.runDigest}
                </Button>
              </form>
            ) : null}
            <form action={toggleSubscriptionAction}>
              <Button type="submit" size="sm" variant={subscribed ? 'outline' : 'default'}>
                {subscribed ? t.newsletter.unsubscribe : t.newsletter.subscribe}
              </Button>
            </form>
          </div>
        </Card>

        <Section title={t.dashboard.submissions} items={submissions} t={t} />
        <Section title={t.dashboard.favorites} items={favorites} t={t} />
        <Section title={t.dashboard.likes} items={likes} t={t} />
      </main>
    </div>
  )
}

function Section({
  title,
  items,
  t,
}: {
  title: string
  items: ActivityItem[]
  t: Dictionary
}) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-[19px] font-semibold leading-[26px]">
        {title}{' '}
        <span className="text-sm font-normal text-[var(--color-text-muted)]">({items.length})</span>
      </h2>
      {items.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">{t.dashboard.empty}</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {items.map((item, i) => (
            <ItemRow key={`${item.type}-${item.id}-${i}`} item={item} t={t} />
          ))}
        </div>
      )}
    </section>
  )
}

function ItemRow({ item, t }: { item: ActivityItem; t: Dictionary }) {
  const href = item.slug && item.type !== 'articles' ? `/${item.type}/${item.slug}` : null
  const inner = (
    <Card className="flex items-start gap-3 p-4">
      <Badge variant="outline">{t.types[item.type]}</Badge>
      <div className="min-w-0">
        <div className="truncate font-medium">{item.title}</div>
        {item.summary ? (
          <div className="line-clamp-1 text-sm text-[var(--color-text-muted)]">{item.summary}</div>
        ) : null}
      </div>
    </Card>
  )
  return href ? (
    <a href={href} className="block transition-opacity hover:opacity-90">
      {inner}
    </a>
  ) : (
    inner
  )
}
