'use client'

import * as React from 'react'
import { useActionState, useTransition } from 'react'
import { useFormStatus } from 'react-dom'

import {
  createContentAction,
  deleteContentAction,
  publishContentAction,
  unpublishContentAction,
  updateContentAction,
  type CreateState,
} from '@/app/(frontend)/content-actions'
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
    <Button type="submit" disabled={pending}>
      {children}
    </Button>
  )
}

export function CreateContentForm({
  type,
  t,
}: {
  type: 'skills' | 'tips' | 'news'
  t: Dictionary
}) {
  const [state, action] = useActionState<CreateState, FormData>(createContentAction, {})
  const errText =
    state.error === 'title'
      ? t.create.needTitle
      : state.error === 'failed'
        ? t.create.failed
        : null

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="type" value={type} />
      <Field label={t.create.titleField}>
        <input name="title" required className={inputCls} />
      </Field>
      <Field label={t.create.summaryField}>
        <textarea name="summary" rows={2} className={inputCls} />
      </Field>
      {type === 'news' ? (
        <>
          <Field label={t.create.urlField}>
            <input name="url" type="url" className={inputCls} />
          </Field>
          <Field label={t.create.sourceField}>
            <input name="source" className={inputCls} />
          </Field>
        </>
      ) : null}
      <Field label={`${t.create.bodyField} — ${t.create.bodyHint}`}>
        <textarea name="body" rows={6} className={inputCls} />
      </Field>
      <Field label={`${t.create.tagsField} (${t.create.tagsHint})`}>
        <input name="tags" className={inputCls} placeholder="prompting, safety" />
      </Field>
      {errText ? <p className="text-sm text-[var(--color-danger)]">{errText}</p> : null}
      <SubmitButton>{t.create.submit}</SubmitButton>
    </form>
  )
}

export function EditContentForm({
  type,
  id,
  slug,
  initial,
  t,
}: {
  type: 'skills' | 'tips' | 'news'
  id: number | string
  slug: string
  initial: { title: string; summary?: string; bodyText?: string; tags?: string; url?: string; source?: string }
  t: Dictionary
}) {
  const [state, action] = useActionState(updateContentAction, {} as { error?: string })
  const errText =
    state.error === 'title' ? t.create.needTitle : state.error === 'forbidden' ? t.create.failed : null

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="id" value={String(id)} />
      <input type="hidden" name="slug" value={slug} />
      <Field label={t.create.titleField}>
        <input name="title" required defaultValue={initial.title} className={inputCls} />
      </Field>
      <Field label={t.create.summaryField}>
        <textarea name="summary" rows={2} defaultValue={initial.summary} className={inputCls} />
      </Field>
      {type === 'news' ? (
        <>
          <Field label={t.create.urlField}>
            <input name="url" type="url" defaultValue={initial.url} className={inputCls} />
          </Field>
          <Field label={t.create.sourceField}>
            <input name="source" defaultValue={initial.source} className={inputCls} />
          </Field>
        </>
      ) : null}
      <Field label={`${t.create.bodyField} — ${t.create.bodyHint}`}>
        <textarea name="body" rows={6} defaultValue={initial.bodyText} className={inputCls} />
      </Field>
      <Field label={`${t.create.tagsField} (${t.create.tagsHint})`}>
        <input name="tags" defaultValue={initial.tags} className={inputCls} />
      </Field>
      {errText ? <p className="text-sm text-[var(--color-danger)]">{errText}</p> : null}
      <SubmitButton>{t.create.save}</SubmitButton>
    </form>
  )
}

export function DeleteButton({
  type,
  id,
  label,
  confirmText,
}: {
  type: 'skills' | 'tips' | 'news'
  id: number | string
  label: string
  confirmText: string
}) {
  const [pending, start] = useTransition()
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() => {
        if (window.confirm(confirmText)) start(() => void deleteContentAction(type, id))
      }}
      className="text-[var(--color-danger)]"
    >
      {label}
    </Button>
  )
}

export function PublishButton({
  type,
  id,
  slug,
  label,
}: {
  type: 'skills' | 'tips' | 'news'
  id: number | string
  slug: string
  label: string
}) {
  const [pending, start] = useTransition()
  return (
    <Button
      type="button"
      size="sm"
      disabled={pending}
      onClick={() => start(() => void publishContentAction(type, id, slug))}
    >
      {label}
    </Button>
  )
}

export function UnpublishButton({
  type,
  id,
  slug,
  label,
}: {
  type: 'skills' | 'tips' | 'news'
  id: number | string
  slug: string
  label: string
}) {
  const [pending, start] = useTransition()
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => start(() => void unpublishContentAction(type, id, slug))}
    >
      {label}
    </Button>
  )
}
