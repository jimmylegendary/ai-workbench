import { headers as nextHeaders } from 'next/headers'
import { getPayload } from 'payload'

import config from '@/payload.config'
import type { Skill } from '@/payload-types'
import { emptyEngState, getEngagementMap } from '@/lib/engagement'
import { getDict } from '@/i18n/server'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EngagementBar } from '@/components/engagement-bar'
import { SiteHeader } from '@/components/site-header'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const { locale, t } = await getDict()
  const payload = await getPayload({ config: await config })
  const { user } = await payload.auth({ headers: await nextHeaders() })
  const { docs: skills } = await payload.find({
    collection: 'skills',
    limit: 24,
    depth: 0,
    sort: '-updatedAt',
  })
  const eng = await getEngagementMap(
    payload,
    'skills',
    skills.map((s) => s.id),
    user?.id,
  )

  return (
    <div className="min-h-dvh">
      <SiteHeader user={user} t={t} locale={locale} active="skills" />

      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-[36px] font-bold leading-[42px] tracking-tight">{t.home.title}</h1>
          <p className="mt-1 text-[var(--color-text-muted)]">{t.home.subtitle}</p>
        </div>

        {skills.length === 0 ? (
          <Card className="flex flex-col items-start gap-3">
            <p className="text-sm text-[var(--color-text-muted)]">{t.home.empty}</p>
            <a href="/admin">
              <Button size="sm">{t.home.openAdmin}</Button>
            </a>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {skills.map((skill: Skill) => (
              <Card key={skill.id} className="flex flex-col">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <h2 className="text-[19px] font-semibold leading-[26px]">
                    {skill.slug ? (
                      <a href={`/skills/${skill.slug}`} className="hover:underline">
                        {skill.title}
                      </a>
                    ) : (
                      skill.title
                    )}
                  </h2>
                  {skill.provenance?.validated ? (
                    <Badge variant="public">{t.skill.validated}</Badge>
                  ) : (
                    <Badge variant="outline">{t.skill.draft}</Badge>
                  )}
                </div>
                {skill.summary ? (
                  <p className="mb-4 line-clamp-3 text-sm text-[var(--color-text-muted)]">
                    {skill.summary}
                  </p>
                ) : null}

                {skill.tags && skill.tags.length > 0 ? (
                  <div className="mb-4 flex flex-wrap gap-1.5">
                    {skill.tags.map((tag, i) => (
                      <Badge key={i} variant="accent">
                        {tag.tag}
                      </Badge>
                    ))}
                  </div>
                ) : null}

                <div className="mt-auto flex items-center justify-between border-t border-border pt-3">
                  <EngagementBar
                    relationTo="skills"
                    id={skill.id}
                    initial={eng.get(String(skill.id)) ?? emptyEngState()}
                    canInteract={Boolean(user)}
                  />
                  {skill.slug ? (
                    <a href={`/skills/${skill.slug}`}>
                      <Button size="sm" variant="ghost">
                        {t.home.view}
                      </Button>
                    </a>
                  ) : (
                    <Button size="sm" variant="ghost" disabled>
                      {t.home.view}
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
