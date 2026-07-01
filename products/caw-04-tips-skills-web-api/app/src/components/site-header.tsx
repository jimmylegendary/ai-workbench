import { logoutAction } from '@/app/(frontend)/auth-actions'
import { HeaderBar } from '@/components/header-bar'
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
  return <HeaderBar user={user} t={t} locale={locale} active={active} logoutAction={logoutAction} />
}
