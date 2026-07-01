import { chromium } from '@playwright/test'

const BASE = 'http://localhost:3000'
const SP = process.env.SP || '.'
const SLUG = 'structured-extraction'

const res = await fetch(`${BASE}/api/users/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'admin@caw04.local', password: 'changeme123' }),
})
const data = await res.json()
if (!data.token) {
  console.error('login failed:', JSON.stringify(data))
  process.exit(1)
}
console.log('login ok, user:', data.user?.email)

const browser = await chromium.launch()
const context = await browser.newContext()
await context.addCookies([
  { name: 'payload-token', value: data.token, domain: 'localhost', path: '/' },
])
const page = await context.newPage()
page.on('console', (m) => {
  if (m.type() === 'error') console.log('PAGE ERROR:', m.text())
})

await page.goto(`${BASE}/skills/${SLUG}`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500) // let ViewPing fire
await page.screenshot({ path: `${SP}/eng-before.png`, fullPage: true })

const likeBtn = page.getByRole('button', { name: 'Like' })
const favBtn = page.getByRole('button', { name: 'Favorite' })
console.log('like before:', (await likeBtn.innerText()).trim())
console.log('favorite before:', (await favBtn.innerText()).trim())

await likeBtn.click()
await page.waitForTimeout(1000)
await favBtn.click()
await page.waitForTimeout(1000)
console.log('like after click:', (await likeBtn.innerText()).trim())
console.log('favorite after click:', (await favBtn.innerText()).trim())
await page.screenshot({ path: `${SP}/eng-after.png`, fullPage: true })

await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(800)
console.log('like after reload:', (await page.getByRole('button', { name: 'Like' }).innerText()).trim())
console.log('favorite after reload:', (await page.getByRole('button', { name: 'Favorite' }).innerText()).trim())
console.log('views after reload:', (await page.getByLabel('Views').innerText()).trim())

// logged-in home screenshot too
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
await page.screenshot({ path: `${SP}/eng-home.png`, fullPage: true })

await browser.close()
process.exit(0)
