import { DeleteButton } from '@/components/create-content-form'
import { Button } from '@/components/ui/button'
import type { Dictionary } from '@/i18n/dictionaries'

export function OwnerControls({
  type,
  id,
  canEdit,
  t,
}: {
  type: 'skills' | 'tips' | 'news'
  id: number | string
  canEdit: boolean
  t: Dictionary
}) {
  if (!canEdit) return null
  return (
    <div className="mt-3 flex gap-2">
      <a href={`/edit/${type}/${id}`}>
        <Button size="sm" variant="outline">
          {t.create.edit}
        </Button>
      </a>
      <DeleteButton type={type} id={id} label={t.create.del} confirmText={t.create.deleteConfirm} />
    </div>
  )
}

export function canEditDoc(
  user: { id?: number | string; roles?: string[] | null } | null | undefined,
  doc: { author?: unknown },
): boolean {
  if (!user) return false
  const roles = (user.roles as string[] | undefined) ?? []
  if (roles.some((r) => r === 'admin' || r === 'curator')) return true
  const author = doc.author as { id?: number | string } | number | string | null | undefined
  const authorId = author && typeof author === 'object' ? author.id : author
  return String(authorId) === String(user.id)
}
