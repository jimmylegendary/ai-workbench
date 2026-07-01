import { getPayload } from 'payload'
import { Eye, Heart, Star } from 'lucide-react'

import config from '@/payload.config'
import type { Skill } from '@/payload-types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

const NAV = [
  { label: 'Skills', href: '/', active: true },
  { label: 'Tips', href: '/tips' },
  { label: 'News', href: '/news' },
]

export default async function HomePage() {
  const payload = await getPayload({ config: await config })
  const { docs: skills } = await payload.find({
    collection: 'skills',
    limit: 24,
    depth: 0,
    sort: '-updatedAt',
  })

  return (
    <div className="min-h-dvh">
      {/* top nav */}
      <header className="sticky top-0 z-10 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <div className="flex items-center gap-6">
            <span className="text-sm font-semibold tracking-tight">
              CAW-04 · <span className="text-[var(--color-primary)]">AI Tips &amp; Skills</span>
            </span>
            <nav className="hidden items-center gap-1 sm:flex">
              {NAV.map((n) => (
                <a
                  key={n.label}
                  href={n.href}
                  className={
                    'rounded-md px-3 py-1.5 text-sm ' +
                    (n.active
                      ? 'bg-[var(--color-surface-muted)] font-medium text-text'
                      : 'text-[var(--color-text-muted)] hover:text-text')
                  }
                >
                  {n.label}
                </a>
              ))}
            </nav>
          </div>
          <a href="/admin">
            <Button size="sm" variant="outline">
              Sign in
            </Button>
          </a>
        </div>
      </header>

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
                  <h2 className="text-[19px] font-semibold leading-[26px]">{skill.title}</h2>
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
                  <div className="flex items-center gap-4 text-xs text-[var(--color-text-muted)]">
                    <span className="inline-flex items-center gap-1">
                      <Heart className="size-3.5" /> 0
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Star className="size-3.5" /> 0
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Eye className="size-3.5" /> 0
                    </span>
                  </div>
                  <Button size="sm" variant="ghost">
                    View
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
