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
page.on('console', (m) => m.type() === 'error' && console.log('PAGE ERROR:', m.text()))

await page.goto(`${BASE}/new/skills`, { waitUntil: 'networkidle' })
await page.fill('input[name="title"]', 'Web authored skill')
await page.fill('textarea[name="summary"]', 'Created from the web form.')
await page.fill('textarea[name="body"]', 'First paragraph from the web.\nSecond paragraph here.')
await page.fill('input[name="tags"]', 'web, authoring')
await page.screenshot({ path: `${SP}/authoring-form.png`, fullPage: true })
await page.locator('main button[type="submit"]').click()
await page.waitForURL(/\/skills\/web-authored-skill/, { timeout: 15000 })
await page.waitForTimeout(600)
console.log('redirected to:', new URL(page.url()).pathname)
console.log('h1:', (await page.locator('h1').first().innerText()).trim())
console.log('body rendered?', (await page.getByText('First paragraph from the web').count()) > 0)
console.log('tag rendered?', (await page.getByText('authoring', { exact: true }).count()) > 0)
await page.screenshot({ path: `${SP}/authoring-result.png`, fullPage: true })

await browser.close()
process.exit(0)
