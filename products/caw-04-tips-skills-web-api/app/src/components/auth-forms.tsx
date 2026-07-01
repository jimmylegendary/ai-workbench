'use client'

import * as React from 'react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import {
  createInviteAction,
  forgotPasswordAction,
  loginAction,
  setPasswordAction,
} from '@/app/(frontend)/auth-actions'
import { Button } from '@/components/ui/button'
import type { Dictionary } from '@/i18n/dictionaries'

const inputCls =
  'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[13px] font-medium text-[var(--color-text-muted)]">{label}</span>
      {children}
    </label>
  )
}

function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {children}
    </Button>
  )
}

function Notice({ children, tone = 'info' }: { children: React.ReactNode; tone?: 'info' | 'error' }) {
  return (
    <p className={tone === 'error' ? 'text-sm text-[var(--color-danger)]' : 'text-sm'}>{children}</p>
  )
}

export function LoginForm({ t }: { t: Dictionary }) {
  const [state, action] = useActionState(loginAction, {})
  return (
    <form action={action} className="space-y-3">
      <Field label={t.common.email}>
        <input name="email" type="email" autoComplete="email" required className={inputCls} />
      </Field>
      <Field label={t.common.password}>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={inputCls}
        />
      </Field>
      {state.error ? <Notice tone="error">{t.auth.login.invalid}</Notice> : null}
      <SubmitButton>{t.auth.login.submit}</SubmitButton>
      <a
        href="/forgot-password"
        className="block text-center text-sm text-[var(--color-text-muted)] hover:text-text"
      >
        {t.auth.login.forgot}
      </a>
    </form>
  )
}

export function ForgotForm({ t }: { t: Dictionary }) {
  const [state, action] = useActionState(forgotPasswordAction, {})
  return (
    <form action={action} className="space-y-3">
      <Field label={t.common.email}>
        <input name="email" type="email" autoComplete="email" required className={inputCls} />
      </Field>
      <SubmitButton>{t.auth.forgot.submit}</SubmitButton>
      {state.sent ? (
        <div className="rounded-md border border-border bg-[var(--color-surface-muted)] p-3">
          <Notice>{t.auth.forgot.sent}</Notice>
          {state.devLink ? (
            <p className="mt-2 break-all font-mono text-xs">
              {t.auth.forgot.devNote}{' '}
              <a className="underline" href={state.devLink}>
                {state.devLink}
              </a>
            </p>
          ) : null}
        </div>
      ) : null}
    </form>
  )
}

export function SetPasswordForm({ t, token }: { t: Dictionary; token: string }) {
  const [state, action] = useActionState(setPasswordAction, {})
  const errText = state.error
    ? {
        short: t.auth.setPassword.short,
        mismatch: t.auth.setPassword.mismatch,
        token: t.auth.setPassword.invalidToken,
        missing: t.auth.setPassword.missingToken,
      }[state.error]
    : null
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <Field label={t.common.password}>
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className={inputCls}
        />
      </Field>
      <Field label={t.common.confirmPassword}>
        <input
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className={inputCls}
        />
      </Field>
      {errText ? <Notice tone="error">{errText}</Notice> : null}
      <SubmitButton>{t.auth.setPassword.submit}</SubmitButton>
    </form>
  )
}

function CopyLink({ text, copyLabel, copiedLabel }: { text: string; copyLabel: string; copiedLabel: string }) {
  const [copied, setCopied] = React.useState(false)
  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 break-all rounded bg-surface px-2 py-1 font-mono text-xs">{text}</code>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => {
          void navigator.clipboard?.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }}
      >
        {copied ? copiedLabel : copyLabel}
      </Button>
    </div>
  )
}

export function InviteForm({ t, origin }: { t: Dictionary; origin: string }) {
  const [state, action] = useActionState(createInviteAction, {})
  return (
    <form action={action} className="space-y-3">
      <Field label={t.common.email}>
        <input name="email" type="email" required className={inputCls} />
      </Field>
      {state.error === 'email' ? <Notice tone="error">{t.auth.invite.needEmail}</Notice> : null}
      {state.error === 'forbidden' ? <Notice tone="error">{t.auth.invite.forbidden}</Notice> : null}
      <SubmitButton>{t.auth.invite.submit}</SubmitButton>
      {state.link ? (
        <div className="rounded-md border border-border bg-[var(--color-surface-muted)] p-3">
          <p className="mb-2 text-sm">{t.auth.invite.created}</p>
          <CopyLink
            text={`${origin}${state.link}`}
            copyLabel={t.common.copy}
            copiedLabel={t.common.copied}
          />
        </div>
      ) : null}
    </form>
  )
}
