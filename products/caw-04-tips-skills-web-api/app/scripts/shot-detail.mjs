import { chromium } from '@playwright/test'

const BASE = 'http://localhost:3000'
const SP = process.env.SP || '.'

const res = await fetch(`${BASE}/api/users/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'admin@caw04.local', password: 'changeme123' }),
})
const { token } = await res.json()
if (!token) throw new Error('login failed')

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 } })
await ctx.addCookies([{ name: 'payload-token', value: token, domain: 'localhost', path: '/' }])
const page = await ctx.newPage()
await page.goto(`${BASE}/skills/safe-prompt-redaction`, { waitUntil: 'networkidle' })
await page.waitForTimeout(400)
await page.screenshot({ path: `${SP}/detail-with-controls.png`, fullPage: true })
await browser.close()
process.exit(0)
