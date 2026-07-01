import { logoutAction } from '@/app/(frontend)/auth-actions'
import { Button } from '@/components/ui/button'
import { LanguageSwitcher } from '@/components/language-switcher'
import type { Locale } from '@/i18n/config'
import type { Dictionary } from '@/i18n/dictionaries'

export function SiteHeader({
  user,
  t,
  locale,
  active = 'skills',
}: {
  user?: { email?: string | null; roles?: string[] | null } | null
  t: Dictionary
  locale: Locale
  active?: 'skills' | 'tips' | 'news' | 'me' | 'articles'
}) {
  const roles = ((user?.roles as string[] | undefined) ?? []) as string[]
  const canInvite = roles.some((r) => r === 'admin' || r === 'curator')
  const nav = [
    { key: 'skills', label: t.nav.skills, href: '/' },
    { key: 'tips', label: t.nav.tips, href: '/tips' },
    { key: 'news', label: t.nav.news, href: '/news' },
    { key: 'articles', label: t.nav.digest, href: '/articles' },
  ] as const

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-surface/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
        <div className="flex items-center gap-6">
          <a href="/" className="text-sm font-semibold tracking-tight">
            CAW-04 · <span className="text-[var(--color-primary)]">{t.brand}</span>
          </a>
          <nav className="hidden items-center gap-1 sm:flex">
            {nav.map((n) => (
              <a
                key={n.key}
                href={n.href}
                className={
                  'rounded-md px-3 py-1.5 text-sm ' +
                  (n.key === active
                    ? 'bg-[var(--color-surface-muted)] font-medium text-text'
                    : 'text-[var(--color-text-muted)] hover:text-text')
                }
              >
                {n.label}
              </a>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <form action="/search" method="get" className="hidden md:block">
            <input
              name="q"
              placeholder={t.common.search}
              aria-label={t.common.search}
              className="h-8 w-40 rounded-md border border-border bg-surface px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
            />
          </form>
          <LanguageSwitcher locale={locale} />
          {user ? (
            <>
              <a href="/new">
                <Button size="sm">{t.create.new}</Button>
              </a>
              <a href="/me">
                <Button size="sm" variant={active === 'me' ? 'outline' : 'ghost'}>
                  {t.common.dashboard}
                </Button>
              </a>
              <span className="hidden text-xs text-[var(--color-text-muted)] md:inline">
                {user.email}
              </span>
              {canInvite ? (
                <a href="/invite">
                  <Button size="sm" variant="ghost">
                    {t.common.invite}
                  </Button>
                </a>
              ) : null}
              <a href="/admin">
                <Button size="sm" variant="outline">
                  {t.common.admin}
                </Button>
              </a>
              <form action={logoutAction}>
                <Button type="submit" size="sm" variant="ghost">
                  {t.common.signOut}
                </Button>
              </form>
            </>
          ) : (
            <a href="/login">
              <Button size="sm" variant="outline">
                {t.common.signIn}
              </Button>
            </a>
          )}
        </div>
      </div>
    </header>
  )
}
