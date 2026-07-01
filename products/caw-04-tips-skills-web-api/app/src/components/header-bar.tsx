'use client'

import * as React from 'react'

import { LanguageSwitcher } from '@/components/language-switcher'
import { Button } from '@/components/ui/button'
import type { Locale } from '@/i18n/config'
import type { Dictionary } from '@/i18n/dictionaries'
import { cn } from '@/lib/utils'

type User = { email?: string | null; roles?: string[] | null } | null | undefined

function SearchForm({ placeholder, className }: { placeholder: string; className?: string }) {
  return (
    <form action="/search" method="get" className={className}>
      <input
        name="q"
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-8 w-full rounded-md border border-border bg-surface px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
      />
    </form>
  )
}

export function HeaderBar({
  user,
  t,
  locale,
  active = 'skills',
  logoutAction,
}: {
  user: User
  t: Dictionary
  locale: Locale
  active?: string
  logoutAction: () => void | Promise<void>
}) {
  const [open, setOpen] = React.useState(false)
  const roles = ((user?.roles as string[] | undefined) ?? []) as string[]
  const canInvite = roles.some((r) => r === 'admin' || r === 'curator')

  const nav = [
    { key: 'skills', label: t.nav.skills, href: '/' },
    { key: 'tips', label: t.nav.tips, href: '/tips' },
    { key: 'news', label: t.nav.news, href: '/news' },
    { key: 'articles', label: t.nav.digest, href: '/articles' },
  ]

  const NavLinks = ({ column }: { column?: boolean }) => (
    <>
      {nav.map((n) => (
        <a
          key={n.key}
          href={n.href}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm',
            column && 'block',
            n.key === active
              ? 'bg-[var(--color-surface-muted)] font-medium text-text'
              : 'text-[var(--color-text-muted)] hover:text-text',
          )}
        >
          {n.label}
        </a>
      ))}
    </>
  )

  const Actions = ({ wrap }: { wrap?: boolean }) =>
    user ? (
      <div className={cn('flex items-center gap-2', wrap && 'flex-wrap')}>
        <a href="/new">
          <Button size="sm">{t.create.new}</Button>
        </a>
        <a href="/me">
          <Button size="sm" variant={active === 'me' ? 'outline' : 'ghost'}>
            {t.common.dashboard}
          </Button>
        </a>
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
      </div>
    ) : (
      <a href="/login">
        <Button size="sm" variant="outline">
          {t.common.signIn}
        </Button>
      </a>
    )

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-6">
        <div className="flex min-w-0 items-center gap-6">
          <a
            href="/"
            className="shrink-0 whitespace-nowrap text-sm font-semibold tracking-tight"
          >
            CAW-04 · <span className="text-[var(--color-primary)]">{t.brand}</span>
          </a>
          <nav className="hidden items-center gap-1 xl:flex">
            <NavLinks />
          </nav>
        </div>

        {/* desktop cluster */}
        <div className="hidden items-center gap-2 xl:flex">
          <SearchForm placeholder={t.common.search} className="w-40" />
          <LanguageSwitcher locale={locale} />
          <Actions />
        </div>

        {/* mobile cluster */}
        <div className="flex items-center gap-2 xl:hidden">
          <LanguageSwitcher locale={locale} />
          <button
            type="button"
            aria-label="Menu"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="rounded-md border border-border p-2 text-text"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {open ? (
                <path d="M6 6l12 12M6 18L18 6" strokeLinecap="round" />
              ) : (
                <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* mobile panel */}
      {open ? (
        <div className="border-t border-border bg-surface px-6 py-4 xl:hidden">
          <nav className="flex flex-col gap-1">
            <NavLinks column />
          </nav>
          <div className="mt-3">
            <SearchForm placeholder={t.common.search} className="w-full" />
          </div>
          <div className="mt-3">
            <Actions wrap />
          </div>
        </div>
      ) : null}
    </header>
  )
}
