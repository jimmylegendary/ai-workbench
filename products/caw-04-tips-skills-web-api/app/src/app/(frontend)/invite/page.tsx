import { headers as nextHeaders } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'

import config from '@/payload.config'
import { getDict } from '@/i18n/server'
import { AuthShell } from '@/components/auth-shell'
import { InviteForm } from '@/components/auth-forms'

export const dynamic = 'force-dynamic'

export default async function InvitePage() {
  const { locale, t } = await getDict()
  const payload = await getPayload({ config: await config })
  const h = await nextHeaders()
  const { user } = await payload.auth({ headers: h })
  const roles = ((user?.roles as string[] | undefined) ?? []) as string[]

  if (!user) redirect('/login')
  if (!roles.some((r) => r === 'admin' || r === 'curator')) redirect('/')

  const host = h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? 'http'
  const origin = `${proto}://${host}`

  return (
    <AuthShell locale={locale} title={t.auth.invite.title} subtitle={t.auth.invite.subtitle}>
      <InviteForm t={t} origin={origin} />
    </AuthShell>
  )
}
