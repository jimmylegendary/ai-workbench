import { Button } from '@/components/ui/button'

const NAV = [
  { label: 'Skills', href: '/' },
  { label: 'Tips', href: '/tips' },
  { label: 'News', href: '/news' },
]

export function SiteHeader({
  userEmail,
  active = 'Skills',
}: {
  userEmail?: string | null
  active?: string
}) {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-surface/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
        <div className="flex items-center gap-6">
          <a href="/" className="text-sm font-semibold tracking-tight">
            CAW-04 · <span className="text-[var(--color-primary)]">AI Tips &amp; Skills</span>
          </a>
          <nav className="hidden items-center gap-1 sm:flex">
            {NAV.map((n) => (
              <a
                key={n.label}
                href={n.href}
                className={
                  'rounded-md px-3 py-1.5 text-sm ' +
                  (n.label === active
                    ? 'bg-[var(--color-surface-muted)] font-medium text-text'
                    : 'text-[var(--color-text-muted)] hover:text-text')
                }
              >
                {n.label}
              </a>
            ))}
          </nav>
        </div>
        {userEmail ? (
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-[var(--color-text-muted)] sm:inline">
              {userEmail}
            </span>
            <a href="/admin">
              <Button size="sm" variant="outline">
                Admin
              </Button>
            </a>
          </div>
        ) : (
          <a href="/admin">
            <Button size="sm" variant="outline">
              Sign in
            </Button>
          </a>
        )}
      </div>
    </header>
  )
}
