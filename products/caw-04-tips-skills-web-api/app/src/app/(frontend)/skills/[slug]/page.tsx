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
import { OwnerControls, canEditDoc } from '@/components/owner-controls'
import { SiteHeader } from '@/components/site-header'
import { ViewPing } from '@/components/view-ping'

export const dynamic = 'force-dynamic'

export default async function SkillDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const { locale, t } = await getDict()
  const payload = await getPayload({ config: await config })
  const { user } = await payload.auth({ headers: await nextHeaders() })
  const { docs } = await payload.find({
    collection: 'skills',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 0,
    draft: true,
  })
  const skill = docs[0]
  if (!skill) notFound()
  const canEdit = canEditDoc(user, skill)
  if (skill._status !== 'published' && !canEdit) notFound()

  const eng = await getEngagement(payload, 'skills', skill.id, user?.id)

  return (
    <div className="min-h-dvh">
      <SiteHeader user={user} t={t} locale={locale} />
      <ViewPing relationTo="skills" id={skill.id} />

      <main className="mx-auto max-w-3xl px-6 py-10">
        <a href="/" className="text-sm text-[var(--color-text-muted)] hover:text-text">
          {t.skill.back}
        </a>
        <OwnerControls
          type="skills"
          id={skill.id}
          slug={skill.slug ?? ''}
          status={skill._status}
          canEdit={canEdit}
          t={t}
        />

        <div className="mt-4 mb-2 flex items-start justify-between gap-3">
          <h1 className="text-[36px] font-bold leading-[42px] tracking-tight">{skill.title}</h1>
          {skill._status !== 'published' ? (
            <Badge variant="outline">{t.skill.draft}</Badge>
          ) : skill.provenance?.validated ? (
            <Badge variant="public">{t.skill.validated}</Badge>
          ) : null}
        </div>
        {skill.summary ? (
          <p className="text-[var(--color-text-muted)]">{skill.summary}</p>
        ) : null}

        {skill.tags && skill.tags.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {skill.tags.map((tag, i) => (
              <Badge key={i} variant="accent">
                {tag.tag}
              </Badge>
            ))}
          </div>
        ) : null}

        <div className="mt-6 border-y border-border py-3">
          <EngagementBar
            relationTo="skills"
            id={skill.id}
            initial={eng}
            canInteract={Boolean(user)}
          />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <MetaList title={t.skill.inputs} items={(skill.inputs ?? []).map(fmtIO)} />
          <MetaList title={t.skill.outputs} items={(skill.outputs ?? []).map(fmtIO)} />
          <MetaList
            title={t.skill.preconditions}
            items={(skill.preconditions ?? []).map((p) => p.value ?? '')}
          />
          <Card>
            <h3 className="mb-2 text-[13px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
              {t.skill.provenance}
            </h3>
            <dl className="space-y-1 text-sm">
              <Row k={t.skill.source} v={skill.provenance?.sourceProduct} />
              <Row k={t.skill.ref} v={skill.provenance?.sourceRef} />
              <Row k={t.skill.validated} v={skill.provenance?.validated ? t.skill.yes : t.skill.no} />
            </dl>
          </Card>
        </div>

        <RichBody body={skill.body} />
      </main>
    </div>
  )
}

function fmtIO(io: { name?: string | null; type?: string | null; required?: boolean | null }) {
  return `${io.name}${io.type ? `: ${io.type}` : ''}${io.required ? ' *' : ''}`
}

function MetaList({ title, items }: { title: string; items: string[] }) {
  return (
    <Card>
      <h3 className="mb-2 text-[13px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
        {title}
      </h3>
      {items.length ? (
        <ul className="list-inside list-disc space-y-1 text-sm">
          {items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[var(--color-text-muted)]">—</p>
      )}
    </Card>
  )
}

function Row({ k, v }: { k: string; v?: string | null }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-[var(--color-text-muted)]">{k}</dt>
      <dd className="font-mono text-xs">{v || '—'}</dd>
    </div>
  )
}
