'use client'

import * as React from 'react'

import { viewAction } from '@/app/(frontend)/actions'
import type { EngType } from '@/lib/engagement'

// Fires a single view increment on mount (guarded against React strict double-run).
export function ViewPing({ relationTo, id }: { relationTo: EngType; id: number }) {
  const done = React.useRef(false)
  React.useEffect(() => {
    if (done.current) return
    done.current = true
    void viewAction(relationTo, id)
  }, [relationTo, id])
  return null
}
