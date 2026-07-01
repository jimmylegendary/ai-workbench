import { chromium } from '@playwright/test'

const BASE = 'http://localhost:3000'
const SP = process.env.SP || '.'

const res = await fetch(`${BASE}/api/users/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'admin@caw04.local', password: 'changeme123' }),
})
const { token } = await res.json()
if (!token) throw new Error('admin login failed')

const browser = await chromium.launch()
const ctx = await browser.newContext()
await ctx.addCookies([{ name: 'payload-token', value: token, domain: 'localhost', path: '/' }])
const page = await ctx.newPage()
page.on('console', (m) => m.type() === 'error' && console.log('PAGE ERROR:', m.text()))

await page.goto(`${BASE}/me`, { waitUntil: 'networkidle' })
await page.waitForTimeout(600)
const h2s = await page.locator('h2').allInnerTexts()
console.log('sections:', h2s.map((s) => s.replace(/\s+/g, ' ').trim()))
await page.screenshot({ path: `${SP}/dashboard-ko.png`, fullPage: true })

await browser.close()
process.exit(0)
