import { headers as nextHeaders } from 'next/headers'
import { getPayload } from 'payload'

import config from '@/payload.config'
import { getDict } from '@/i18n/server'
import { searchContent } from '@/lib/search'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { SiteHeader } from '@/components/site-header'

export const dynamic = 'force-dynamic'

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q = '' } = await searchParams
  const { locale, t } = await getDict()
  const payload = await getPayload({ config: await config })
  const { user } = await payload.auth({ headers: await nextHeaders() })
  const query = q.trim()
  const results = query ? await searchContent(payload, query) : []

  return (
    <div className="min-h-dvh">
      <SiteHeader user={user} t={t} locale={locale} />
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-[36px] font-bold leading-[42px] tracking-tight">{t.searchPage.title}</h1>

        <form action="/search" method="get" className="mt-4">
          <input
            name="q"
            defaultValue={query}
            placeholder={t.searchPage.placeholder}
            aria-label={t.searchPage.title}
            className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
          />
        </form>

        <div className="mt-6">
          {!query ? (
            <p className="text-sm text-[var(--color-text-muted)]">{t.searchPage.prompt}</p>
          ) : results.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">{t.searchPage.empty}</p>
          ) : (
            <>
              <p className="mb-3 text-sm text-[var(--color-text-muted)]">
                {t.searchPage.resultsFor}: “{query}” ({results.length})
              </p>
              <div className="space-y-2">
                {results.map((r) => (
                  <a key={`${r.type}-${r.id}`} href={`/${r.type}/${r.slug}`} className="block">
                    <Card className="flex items-start gap-3 p-4 hover:shadow-md">
                      <Badge variant="outline">{t.types[r.type]}</Badge>
                      <div className="min-w-0">
                        <div className="truncate font-medium">{r.title}</div>
                        {r.summary ? (
                          <div className="line-clamp-1 text-sm text-[var(--color-text-muted)]">
                            {r.summary}
                          </div>
                        ) : null}
                      </div>
                    </Card>
                  </a>
                ))}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
