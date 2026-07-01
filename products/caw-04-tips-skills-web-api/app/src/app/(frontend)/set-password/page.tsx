import { getDict } from '@/i18n/server'
import { AuthShell } from '@/components/auth-shell'
import { SetPasswordForm } from '@/components/auth-forms'

export const dynamic = 'force-dynamic'

export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  const { locale, t } = await getDict()
  return (
    <AuthShell locale={locale} title={t.auth.setPassword.title} subtitle={t.auth.setPassword.subtitle}>
      <SetPasswordForm t={t} token={token ?? ''} />
    </AuthShell>
  )
}
