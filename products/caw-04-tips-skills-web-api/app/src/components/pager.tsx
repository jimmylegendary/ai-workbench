export function Pager({
  basePath,
  page,
  totalPages,
  params,
}: {
  basePath: string
  page: number
  totalPages: number
  params?: Record<string, string | undefined>
}) {
  if (totalPages <= 1) return null
  const href = (p: number) => {
    const sp = new URLSearchParams()
    Object.entries(params ?? {}).forEach(([k, v]) => {
      if (v) sp.set(k, v)
    })
    if (p > 1) sp.set('page', String(p))
    const s = sp.toString()
    return s ? `${basePath}?${s}` : basePath
  }
  return (
    <div className="mt-8 flex items-center justify-between text-sm">
      {page > 1 ? (
        <a href={href(page - 1)} className="text-[var(--color-primary)] hover:underline">
          ← Prev
        </a>
      ) : (
        <span />
      )}
      <span className="text-[var(--color-text-muted)]">
        {page} / {totalPages}
      </span>
      {page < totalPages ? (
        <a href={href(page + 1)} className="text-[var(--color-primary)] hover:underline">
          Next →
        </a>
      ) : (
        <span />
      )}
    </div>
  )
}
