'use server'

import crypto from 'crypto'
import { headers as nextHeaders } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getPayload } from 'payload'

import config from '@/payload.config'
import { clearSessionCookie, setSessionCookie } from '@/lib/auth'

async function pl() {
  return getPayload({ config: await config })
}

export type LoginState = { error?: 'invalid' }
export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') || '').trim().toLowerCase()
  const password = String(formData.get('password') || '')
  const payload = await pl()
  let ok = false
  try {
    const res = await payload.login({ collection: 'users', data: { email, password } })
    if (res.token) {
      await setSessionCookie(res.token, res.exp)
      ok = true
    }
  } catch {
    /* fall through to error */
  }
  if (!ok) return { error: 'invalid' }
  redirect('/')
}

export type SetPasswordState = { error?: 'short' | 'mismatch' | 'token' | 'missing' }
export async function setPasswordAction(
  _prev: SetPasswordState,
  formData: FormData,
): Promise<SetPasswordState> {
  const token = String(formData.get('token') || '')
  const password = String(formData.get('password') || '')
  const confirm = String(formData.get('confirm') || '')
  if (!token) return { error: 'missing' }
  if (password.length < 8) return { error: 'short' }
  if (password !== confirm) return { error: 'mismatch' }
  const payload = await pl()
  let ok = false
  try {
    const res = await payload.resetPassword({
      collection: 'users',
      data: { token, password },
      overrideAccess: true,
    })
    if (res.token) {
      await setSessionCookie(res.token)
      ok = true
    }
  } catch {
    /* invalid/expired token */
  }
  if (!ok) return { error: 'token' }
  redirect('/')
}

export type ForgotState = { sent?: boolean; devLink?: string }
export async function forgotPasswordAction(
  _prev: ForgotState,
  formData: FormData,
): Promise<ForgotState> {
  const email = String(formData.get('email') || '').trim().toLowerCase()
  const payload = await pl()
  try {
    const token = await payload.forgotPassword({
      collection: 'users',
      data: { email },
      disableEmail: true,
    })
    // In production, wire an email adapter to deliver this link instead.
    console.log(`[forgot-password] reset link for ${email}: /set-password?token=${token}`)
    if (process.env.NODE_ENV !== 'production') {
      return { sent: true, devLink: `/set-password?token=${token}` }
    }
  } catch {
    /* never reveal whether the account exists */
  }
  return { sent: true }
}

export type InviteState = { error?: 'forbidden' | 'email'; link?: string; email?: string }
export async function createInviteAction(
  _prev: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const payload = await pl()
  const { user } = await payload.auth({ headers: await nextHeaders() })
  const roles = ((user?.roles as string[] | undefined) ?? []) as string[]
  if (!user || !roles.some((r) => r === 'admin' || r === 'curator')) {
    return { error: 'forbidden' }
  }
  const email = String(formData.get('email') || '').trim().toLowerCase()
  if (!email) return { error: 'email' }

  const existing = await payload.find({
    collection: 'users',
    where: { email: { equals: email } },
    limit: 1,
  })
  if (!existing.docs.length) {
    await payload.create({
      collection: 'users',
      data: { email, password: crypto.randomUUID(), roles: ['member'] },
    })
  }
  const token = await payload.forgotPassword({
    collection: 'users',
    data: { email },
    disableEmail: true,
  })
  return { link: `/set-password?token=${token}`, email }
}

export async function logoutAction() {
  await clearSessionCookie()
  revalidatePath('/')
  redirect('/')
}
