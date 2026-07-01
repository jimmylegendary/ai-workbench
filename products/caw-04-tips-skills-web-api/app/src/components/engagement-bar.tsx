'use client'

import * as React from 'react'
import { Eye, Heart, Star } from 'lucide-react'

import { favoriteAction, likeAction } from '@/app/(frontend)/actions'
import type { EngState, EngType } from '@/lib/engagement'
import { cn } from '@/lib/utils'

export function EngagementBar({
  relationTo,
  id,
  initial,
  canInteract,
}: {
  relationTo: EngType
  id: number
  initial: EngState
  canInteract: boolean
}) {
  const [s, setS] = React.useState<EngState>(initial)
  const [pending, start] = React.useTransition()

  const like = () =>
    canInteract &&
    start(async () => {
      const r = await likeAction(relationTo, id)
      if (r.ok) setS((p) => ({ ...p, likes: r.likes, likedByMe: r.liked }))
    })

  const favorite = () =>
    canInteract &&
    start(async () => {
      const r = await favoriteAction(relationTo, id)
      if (r.ok) setS((p) => ({ ...p, favorites: r.favorites, favoritedByMe: r.favorited }))
    })

  const btn =
    'inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs transition-colors disabled:opacity-60'

  return (
    <div className="flex items-center gap-1 text-[var(--color-text-muted)]">
      <button
        type="button"
        onClick={like}
        disabled={!canInteract || pending}
        aria-pressed={s.likedByMe}
        aria-label="Like"
        className={cn(
          btn,
          canInteract && 'hover:text-[var(--color-danger)] cursor-pointer',
          s.likedByMe && 'text-[var(--color-danger)]',
        )}
      >
        <Heart className={cn('size-3.5', s.likedByMe && 'fill-current')} /> {s.likes}
      </button>
      <button
        type="button"
        onClick={favorite}
        disabled={!canInteract || pending}
        aria-pressed={s.favoritedByMe}
        aria-label="Favorite"
        className={cn(
          btn,
          canInteract && 'hover:text-[var(--color-warning)] cursor-pointer',
          s.favoritedByMe && 'text-[var(--color-warning)]',
        )}
      >
        <Star className={cn('size-3.5', s.favoritedByMe && 'fill-current')} /> {s.favorites}
      </button>
      <span className={cn(btn, 'cursor-default')} aria-label="Views">
        <Eye className="size-3.5" /> {s.views}
      </span>
    </div>
  )
}
