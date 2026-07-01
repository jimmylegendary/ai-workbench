import { headers as nextHeaders } from 'next/headers'
import { getPayload } from 'payload'

import config from '@/payload.config'
import type { Skill } from '@/payload-types'
import { emptyEngState, getEngagementMap } from '@/lib/engagement'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EngagementBar } from '@/components/engagement-bar'
import { SiteHeader } from '@/components/site-header'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
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
      <SiteHeader userEmail={user?.email} active="Skills" />

      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-[36px] font-bold leading-[42px] tracking-tight">Skills</h1>
          <p className="mt-1 text-[var(--color-text-muted)]">
            Reusable, validated units for working with AI — inputs, outputs, and provenance.
          </p>
        </div>

        {skills.length === 0 ? (
          <Card className="flex flex-col items-start gap-3">
            <p className="text-sm text-[var(--color-text-muted)]">
              No skills yet. Seed sample content with{' '}
              <code className="rounded bg-[var(--color-surface-muted)] px-1.5 py-0.5 font-mono text-xs">
                pnpm seed
              </code>{' '}
              or create one in the admin.
            </p>
            <a href="/admin">
              <Button size="sm">Open admin</Button>
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
                    <Badge variant="public">validated</Badge>
                  ) : (
                    <Badge variant="outline">draft</Badge>
                  )}
                </div>
                {skill.summary ? (
                  <p className="mb-4 line-clamp-3 text-sm text-[var(--color-text-muted)]">
                    {skill.summary}
                  </p>
                ) : null}

                {skill.tags && skill.tags.length > 0 ? (
                  <div className="mb-4 flex flex-wrap gap-1.5">
                    {skill.tags.map((t, i) => (
                      <Badge key={i} variant="accent">
                        {t.tag}
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
                        View
                      </Button>
                    </a>
                  ) : (
                    <Button size="sm" variant="ghost" disabled>
                      View
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
