import type { EngState, EngType } from '@/lib/engagement'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EngagementBar } from '@/components/engagement-bar'

export function ContentCard({
  type,
  id,
  slug,
  title,
  summary,
  tags,
  badge,
  extra,
  eng,
  canInteract,
  viewLabel,
}: {
  type: EngType
  id: number
  slug?: string | null
  title: string
  summary?: string | null
  tags?: ({ tag?: string | null } | null)[] | null
  badge?: React.ReactNode
  extra?: React.ReactNode
  eng: EngState
  canInteract: boolean
  viewLabel: string
}) {
  const href = slug ? `/${type}/${slug}` : null
  return (
    <Card className="flex flex-col">
      <div className="mb-2 flex items-start justify-between gap-3">
        <h2 className="text-[19px] font-semibold leading-[26px]">
          {href ? (
            <a href={href} className="hover:underline">
              {title}
            </a>
          ) : (
            title
          )}
        </h2>
        {badge}
      </div>
      {extra}
      {summary ? (
        <p className="mb-4 line-clamp-3 text-sm text-[var(--color-text-muted)]">{summary}</p>
      ) : null}
      {tags && tags.length > 0 ? (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {tags.map((t, i) =>
            t?.tag ? (
              <Badge key={i} variant="accent">
                {t.tag}
              </Badge>
            ) : null,
          )}
        </div>
      ) : null}
      <div className="mt-auto flex items-center justify-between border-t border-border pt-3">
        <EngagementBar relationTo={type} id={id} initial={eng} canInteract={canInteract} />
        {href ? (
          <a href={href}>
            <Button size="sm" variant="ghost">
              {viewLabel}
            </Button>
          </a>
        ) : (
          <Button size="sm" variant="ghost" disabled>
            {viewLabel}
          </Button>
        )}
      </div>
    </Card>
  )
}
