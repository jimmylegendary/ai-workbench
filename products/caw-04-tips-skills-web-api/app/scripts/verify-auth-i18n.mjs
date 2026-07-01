import { chromium } from '@playwright/test'

const BASE = 'http://localhost:3000'
const SP = process.env.SP || '.'
const newEmail = `member-${Date.now()}@caw04.local`

// 1) admin login (REST) -> token
const res = await fetch(`${BASE}/api/users/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'admin@caw04.local', password: 'changeme123' }),
})
const { token } = await res.json()
if (!token) throw new Error('admin login failed')

const browser = await chromium.launch()

// 2) admin creates an invite link
const adminCtx = await browser.newContext()
await adminCtx.addCookies([{ name: 'payload-token', value: token, domain: 'localhost', path: '/' }])
const admin = await adminCtx.newPage()
await admin.goto(`${BASE}/invite`, { waitUntil: 'networkidle' })
await admin.screenshot({ path: `${SP}/auth-invite.png`, fullPage: true })
await admin.fill('input[name="email"]', newEmail)
await admin.locator('button[type="submit"]').click()
await admin.waitForSelector('code', { timeout: 10000 })
const inviteLink = (await admin.locator('code').first().innerText()).trim()
console.log('invite link:', inviteLink)
await admin.screenshot({ path: `${SP}/auth-invite-link.png`, fullPage: true })

// 3) invited user opens the link, sets a password, gets auto-logged-in
const userCtx = await browser.newContext()
const user = await userCtx.newPage()
user.on('console', (m) => m.type() === 'error' && console.log('PAGE ERROR:', m.text()))
await user.goto(inviteLink, { waitUntil: 'networkidle' })
await user.fill('input[name="password"]', 'memberpass123')
await user.fill('input[name="confirm"]', 'memberpass123')
await user.locator('button[type="submit"]').click()
await user.waitForURL(`${BASE}/`, { timeout: 15000 })
await user.waitForTimeout(800)
const signedInKo = await user.getByText('로그아웃').count()
console.log('after set-password: signed in (로그아웃 visible)?', signedInKo > 0)
console.log('header shows email?', (await user.getByText(newEmail).count()) > 0)
await user.screenshot({ path: `${SP}/auth-home-loggedin-ko.png`, fullPage: true })

// 4) language switch ko -> en
const h1ko = (await user.locator('h1').first().innerText()).trim()
await user.getByRole('button', { name: 'EN', exact: true }).click()
await user.waitForTimeout(1200)
const h1en = (await user.locator('h1').first().innerText()).trim()
console.log('h1 ko:', h1ko, '-> en:', h1en)
await user.screenshot({ path: `${SP}/auth-home-loggedin-en.png`, fullPage: true })

await browser.close()
process.exit(0)
