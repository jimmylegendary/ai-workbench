import { chromium } from '@playwright/test'

const BASE = 'http://localhost:3000'
const KEY = 'caw04-agent-dev-key-0123456789'
const delSlug = `to-be-deleted-${Date.now()}`

// login (admin)
const login = await fetch(`${BASE}/api/users/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'admin@caw04.local', password: 'changeme123' }),
})
const { token } = await login.json()
if (!token) throw new Error('login failed')

// create a throwaway skill (for delete test) via the write API
await fetch(`${BASE}/api/skills`, {
  method: 'POST',
  headers: { Authorization: `users API-Key ${KEY}`, 'content-type': 'application/json' },
  body: JSON.stringify({ title: 'Delete me', slug: delSlug, summary: 'temp' }),
})

const browser = await chromium.launch()
const ctx = await browser.newContext()
await ctx.addCookies([{ name: 'payload-token', value: token, domain: 'localhost', path: '/' }])
const page = await ctx.newPage()
page.on('console', (m) => m.type() === 'error' && console.log('PAGE ERROR:', m.text()))
page.on('dialog', (d) => d.accept())

// EDIT: web-authored-skill -> change summary
const newSummary = `Edited at ${Date.now()}`
await page.goto(`${BASE}/skills/web-authored-skill`, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: '수정' }).click()
await page.waitForURL(/\/edit\/skills\//, { timeout: 10000 })
await page.fill('textarea[name="summary"]', newSummary)
await page.locator('main button[type="submit"]').click()
await page.waitForURL(/\/skills\/web-authored-skill/, { timeout: 15000 })
await page.waitForTimeout(500)
console.log('edit persisted?', (await page.getByText(newSummary).count()) > 0)

// DELETE: throwaway skill
await page.goto(`${BASE}/skills/${delSlug}`, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: '삭제' }).click()
await page.waitForURL(`${BASE}/`, { timeout: 15000 })
await page.waitForTimeout(500)
const gone = await fetch(`${BASE}/skills/${delSlug}`)
console.log('deleted (detail 404)?', gone.status === 404)

await browser.close()
process.exit(0)
