import { getDict } from '@/i18n/server'
import { AuthShell } from '@/components/auth-shell'
import { ForgotForm } from '@/components/auth-forms'

export const dynamic = 'force-dynamic'

export default async function ForgotPasswordPage() {
  const { locale, t } = await getDict()
  return (
    <AuthShell locale={locale} title={t.auth.forgot.title} subtitle={t.auth.forgot.subtitle}>
      <ForgotForm t={t} />
    </AuthShell>
  )
}
