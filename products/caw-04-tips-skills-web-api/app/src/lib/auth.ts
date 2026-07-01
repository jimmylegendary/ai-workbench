import { cookies } from 'next/headers'

// Payload's default auth cookie is `${cookiePrefix}-token` (prefix defaults to "payload").
const AUTH_COOKIE = 'payload-token'
const DEFAULT_MAX_AGE = 7200 // Payload default token expiration (2h)

export async function setSessionCookie(token: string, expUnixSeconds?: number) {
  const store = await cookies()
  store.set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    ...(expUnixSeconds
      ? { expires: new Date(expUnixSeconds * 1000) }
      : { maxAge: DEFAULT_MAX_AGE }),
  })
}

export async function clearSessionCookie() {
  const store = await cookies()
  store.delete(AUTH_COOKIE)
}
