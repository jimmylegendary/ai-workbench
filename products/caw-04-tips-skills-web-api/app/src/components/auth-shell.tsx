import type { Locale } from '@/i18n/config'
import { LanguageSwitcher } from '@/components/language-switcher'

export function AuthShell({
  locale,
  title,
  subtitle,
  children,
}: {
  locale: Locale
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <a href="/" className="text-sm font-semibold tracking-tight">
            CAW-04 · <span className="text-[var(--color-primary)]">AI Tips &amp; Skills</span>
          </a>
          <LanguageSwitcher locale={locale} />
        </div>
      </header>
      <main className="mx-auto w-full max-w-md px-6 py-16">
        <h1 className="text-[26px] font-semibold leading-[32px]">{title}</h1>
        {subtitle ? (
          <p className="mt-1 mb-6 text-sm text-[var(--color-text-muted)]">{subtitle}</p>
        ) : (
          <div className="mb-6" />
        )}
        {children}
      </main>
    </div>
  )
}
