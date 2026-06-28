/** Tiny className joiner (swap for clsx+tailwind-merge when you add shadcn). */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
