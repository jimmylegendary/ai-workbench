import type { Payload } from 'payload'

import { plaintextToLexical } from './lexical'

type DigestType = 'skills' | 'tips' | 'news'
const DIGEST_TYPES: DigestType[] = ['skills', 'tips', 'news']

interface DigestItem {
  type: DigestType
  id: number | string
  title: string
  summary?: string | null
}

// ── AI intro (provider-selectable) ─────────────────────────────────────────
// AI_PROVIDER=openai  → OpenAI-compatible chat API (OPENAI_BASE_URL/OPENAI_MODEL)
// AI_PROVIDER=cli     → an agent CLI that reads the prompt on stdin, prints result
// (unset / error)     → deterministic fallback intro
async function openaiIntro(prompt: string): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY
  if (!key) return null
  const base = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) throw new Error(`openai ${res.status}`)
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
  return data.choices?.[0]?.message?.content?.trim() || null
}

async function cliIntro(prompt: string): Promise<string | null> {
  const cmd = process.env.AI_CLI_COMMAND
  if (!cmd) return null
  const { spawn } = await import('node:child_process')
  return new Promise<string | null>((resolve) => {
    const child = spawn('sh', ['-c', cmd], { stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''
    const timeout = setTimeout(
      () => {
        try {
          child.kill()
        } catch {}
        resolve(null)
      },
      Number(process.env.AI_CLI_TIMEOUT_MS || 60000),
    )
    child.stdout.on('data', (d) => (out += d))
    child.on('error', () => {
      clearTimeout(timeout)
      resolve(null)
    })
    child.on('close', (code) => {
      clearTimeout(timeout)
      resolve(code === 0 && out.trim() ? out.trim() : null)
    })
    child.stdin.write(prompt)
    child.stdin.end()
  })
}

async function generateIntro(items: DigestItem[], dateStr: string): Promise<string | null> {
  const provider = process.env.AI_PROVIDER
  if (!provider) return null
  const list = items
    .map((i) => `- [${i.type}] ${i.title}${i.summary ? `: ${i.summary}` : ''}`)
    .join('\n')
  const prompt = `Write a friendly 2-3 sentence intro (Korean) for an internal AI knowledge digest dated ${dateStr}, covering these items:\n${list}`
  try {
    if (provider === 'openai') return await openaiIntro(prompt)
    if (provider === 'cli') return await cliIntro(prompt)
  } catch (err) {
    console.error('[digest] AI intro failed, using deterministic fallback:', err)
  }
  return null
}

// ── Build the digest Article ────────────────────────────────────────────────
export async function generateDigest(payload: Payload, dateStr: string) {
  const results = await Promise.all(
    DIGEST_TYPES.map((type) =>
      payload.find({ collection: type, limit: 5, sort: '-createdAt', depth: 0 }),
    ),
  )
  const items: DigestItem[] = results.flatMap((r, idx) =>
    r.docs.map((d) => ({
      type: DIGEST_TYPES[idx],
      id: (d as { id: number | string }).id,
      title: (d as { title?: string }).title ?? '(untitled)',
      summary: (d as { summary?: string | null }).summary ?? null,
    })),
  )

  const title = `AI 다이제스트 — ${dateStr}`
  const lines = items.map((i) => `• [${i.type}] ${i.title}${i.summary ? ` — ${i.summary}` : ''}`)
  let intro = `이번 다이제스트에는 ${items.length}개의 새로운 항목이 있습니다.`
  const ai = await generateIntro(items, dateStr)
  if (ai) intro = ai
  const bodyText = [intro, '', ...lines].join('\n')

  const article = await payload.create({
    collection: 'articles',
    data: {
      title,
      slug: `digest-${dateStr}-${Date.now().toString(36).slice(-5)}`,
      summary: intro,
      body: plaintextToLexical(bodyText),
      curatedItems: items.map((i) => ({ relationTo: i.type, value: i.id })),
      generatedBy: 'ai',
      publishedAt: `${dateStr}T00:00:00.000Z`,
    },
  })
  return article
}

// ── Delivery via n8n webhook (webhook + MCP workflow handles the actual email) ─
export async function sendDigest(
  payload: Payload,
  article: { id: number | string; title: string; summary?: string | null; slug?: string },
) {
  const subs = await payload.find({
    collection: 'subscriptions',
    where: { active: { equals: true } },
    depth: 0,
    limit: 1000,
  })
  const recipients = subs.docs
    .map((s) => (s as { email?: string | null }).email)
    .filter((e): e is string => Boolean(e))

  const body = {
    subject: article.title,
    summary: article.summary ?? '',
    articleId: article.id,
    articleSlug: article.slug,
    recipients,
  }

  const webhook = process.env.N8N_WEBHOOK_URL
  if (webhook) {
    try {
      const headers: Record<string, string> = { 'content-type': 'application/json' }
      if (process.env.N8N_WEBHOOK_TOKEN) {
        headers.Authorization = `Bearer ${process.env.N8N_WEBHOOK_TOKEN}`
      }
      const res = await fetch(webhook, { method: 'POST', headers, body: JSON.stringify(body) })
      if (!res.ok) console.error('[newsletter] n8n webhook non-2xx:', res.status)
    } catch (err) {
      console.error('[newsletter] n8n webhook failed:', err)
    }
  } else {
    console.log(
      `[newsletter] (dev, no N8N_WEBHOOK_URL) "${article.title}" -> ${recipients.length} subscriber(s): ${recipients.join(', ') || '(none)'}`,
    )
  }

  await payload.update({
    collection: 'articles',
    id: article.id,
    data: { sentAsNewsletter: true },
  })
  return { recipients: recipients.length }
}
