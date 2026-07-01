import { getDict } from '@/i18n/server'
import { AuthShell } from '@/components/auth-shell'
import { LoginForm } from '@/components/auth-forms'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  const { locale, t } = await getDict()
  return (
    <AuthShell locale={locale} title={t.auth.login.title} subtitle={t.auth.login.subtitle}>
      <LoginForm t={t} />
    </AuthShell>
  )
}
