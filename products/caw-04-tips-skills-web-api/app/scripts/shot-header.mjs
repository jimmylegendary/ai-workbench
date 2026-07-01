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
const ctx = await browser.newContext()
await ctx.addCookies([{ name: 'payload-token', value: token, domain: 'localhost', path: '/' }])
const page = await ctx.newPage()

// desktop
await page.setViewportSize({ width: 1440, height: 340 })
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
await page.waitForTimeout(400)
await page.screenshot({ path: `${SP}/header-desktop.png` })

// mobile
await page.setViewportSize({ width: 390, height: 720 })
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(400)
await page.screenshot({ path: `${SP}/header-mobile-closed.png` })
await page.getByRole('button', { name: 'Menu' }).click()
await page.waitForTimeout(400)
await page.screenshot({ path: `${SP}/header-mobile-open.png` })

await browser.close()
process.exit(0)
