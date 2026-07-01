import { headers as nextHeaders } from 'next/headers'
import { getPayload } from 'payload'
import type { Where } from 'payload'

import config from '@/payload.config'
import { emptyEngState, getEngagementMap } from '@/lib/engagement'
import { getDict } from '@/i18n/server'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ContentCard } from '@/components/content-card'
import { Pager } from '@/components/pager'
import { SiteHeader } from '@/components/site-header'

export const dynamic = 'force-dynamic'

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ tag?: string; page?: string }>
}) {
  const { tag, page: pageStr } = await searchParams
  const page = Math.max(1, Number(pageStr) || 1)
  const { locale, t } = await getDict()
  const payload = await getPayload({ config: await config })
  const { user } = await payload.auth({ headers: await nextHeaders() })

  const where: Where | undefined = tag ? { 'tags.tag': { equals: tag } } : undefined
  const result = await payload.find({
    collection: 'skills',
    limit: 12,
    page,
    depth: 0,
    sort: '-updatedAt',
    where,
  })
  const skills = result.docs
  const eng = await getEngagementMap(payload, 'skills', skills.map((s) => s.id), user?.id)

  return (
    <div className="min-h-dvh">
      <SiteHeader user={user} t={t} locale={locale} active="skills" />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-[36px] font-bold leading-[42px] tracking-tight">{t.home.title}</h1>
          <p className="mt-1 text-[var(--color-text-muted)]">{t.home.subtitle}</p>
          {tag ? (
            <a href="/" className="mt-3 inline-flex items-center gap-1 text-sm text-[var(--color-primary)]">
              #{tag} <span className="text-[var(--color-text-muted)]">✕</span>
            </a>
          ) : null}
        </div>

        {skills.length === 0 ? (
          <Card className="flex flex-col items-start gap-3">
            <p className="text-sm text-[var(--color-text-muted)]">{t.home.empty}</p>
            <a href="/admin">
              <Button size="sm">{t.home.openAdmin}</Button>
            </a>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {skills.map((skill) => (
                <ContentCard
                  key={skill.id}
                  type="skills"
                  id={skill.id}
                  slug={skill.slug}
                  title={skill.title}
                  summary={skill.summary}
                  tags={skill.tags}
                  tagBase="/"
                  badge={
                    skill.provenance?.validated ? (
                      <Badge variant="public">{t.skill.validated}</Badge>
                    ) : (
                      <Badge variant="outline">{t.skill.draft}</Badge>
                    )
                  }
                  eng={eng.get(String(skill.id)) ?? emptyEngState()}
                  canInteract={Boolean(user)}
                  viewLabel={t.home.view}
                />
              ))}
            </div>
            <Pager basePath="/" page={page} totalPages={result.totalPages} params={{ tag }} />
          </>
        )}
      </main>
    </div>
  )
}
