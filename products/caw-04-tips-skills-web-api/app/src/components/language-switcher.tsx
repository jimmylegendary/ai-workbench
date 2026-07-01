'use client'

import { useRouter } from 'next/navigation'
import * as React from 'react'

import { LOCALE_COOKIE, LOCALES, type Locale } from '@/i18n/config'
import { cn } from '@/lib/utils'

const LABELS: Record<Locale, string> = { ko: '한국어', en: 'EN' }

export function LanguageSwitcher({ locale }: { locale: Locale }) {
  const router = useRouter()
  const [pending, start] = React.useTransition()

  const pick = (next: Locale) => {
    if (next === locale) return
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`
    start(() => router.refresh())
  }

  return (
    <div className="inline-flex items-center rounded-md border border-border p-0.5 text-xs" role="group">
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => pick(l)}
          disabled={pending}
          aria-pressed={l === locale}
          className={cn(
            'rounded px-2 py-0.5 transition-colors',
            l === locale
              ? 'bg-[var(--color-surface-muted)] font-medium text-text'
              : 'text-[var(--color-text-muted)] hover:text-text',
          )}
        >
          {LABELS[l]}
        </button>
      ))}
    </div>
  )
}
