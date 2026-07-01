import { chromium } from '@playwright/test'

const BASE = 'http://localhost:3000'
const SP = process.env.SP || '.'

// wait for server
for (let i = 0; i < 60; i++) {
  try {
    const r = await fetch(BASE + '/')
    if (r.ok) break
  } catch {}
  await new Promise((res) => setTimeout(res, 2000))
}

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

await page.goto(`${BASE}/me`, { waitUntil: 'networkidle' })
// subscribe
await page.getByRole('button', { name: '구독', exact: true }).click()
await page.waitForTimeout(1000)
const subscribed = (await page.getByRole('button', { name: '구독 취소' }).count()) > 0
console.log('subscribed after click?', subscribed)

// run digest (admin) -> redirects to /articles/<slug>
await page.getByRole('button', { name: '다이제스트 생성' }).click()
await page.waitForURL(/\/articles\/digest-/, { timeout: 20000 })
await page.waitForTimeout(600)
console.log('digest article url:', new URL(page.url()).pathname)
console.log('h1:', (await page.locator('h1').first().innerText()).trim())
console.log('AI badge?', (await page.getByText('AI 생성').count()) > 0)
console.log('sent badge?', (await page.getByText('발송됨').count()) > 0)
console.log('curated section?', (await page.getByText('포함된 항목').count()) > 0)
await page.screenshot({ path: `${SP}/digest-article.png`, fullPage: true })

// articles list
await page.goto(`${BASE}/articles`, { waitUntil: 'networkidle' })
await page.screenshot({ path: `${SP}/articles-list.png`, fullPage: true })

await browser.close()
process.exit(0)
