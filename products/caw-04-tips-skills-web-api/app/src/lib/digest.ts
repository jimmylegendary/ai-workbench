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

// Optional Claude intro (only runs if ANTHROPIC_API_KEY is set); otherwise the
// deterministic fallback is used. Kept dependency-free via fetch.
async function claudeIntro(items: DigestItem[], dateStr: string): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return null
  const model = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5'
  const list = items.map((i) => `- [${i.type}] ${i.title}${i.summary ? `: ${i.summary}` : ''}`).join('\n')
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: `Write a 2-3 sentence friendly intro (Korean) for an internal AI knowledge digest dated ${dateStr}, covering these items:\n${list}`,
        },
      ],
    }),
  })
  if (!res.ok) throw new Error(`anthropic ${res.status}`)
  const data = (await res.json()) as { content?: Array<{ text?: string }> }
  return data.content?.map((c) => c.text ?? '').join('').trim() || null
}

async function pushToListmonk(subject: string, htmlBody: string, recipients: string[]) {
  const base = process.env.LISTMONK_URL
  if (!base) return
  const auth = Buffer.from(
    `${process.env.LISTMONK_USER || 'admin'}:${process.env.LISTMONK_PASSWORD || ''}`,
  ).toString('base64')
  // Seam: create a campaign in listmonk. Requires a configured list; see LISTMONK_LIST_ID.
  await fetch(`${base.replace(/\/$/, '')}/api/campaigns`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Basic ${auth}` },
    body: JSON.stringify({
      name: subject,
      subject,
      lists: [Number(process.env.LISTMONK_LIST_ID || 1)],
      type: 'regular',
      content_type: 'html',
      body: htmlBody + `\n<!-- ${recipients.length} recipient(s) -->`,
    }),
  })
}

/** Build recent content into an AI-curated Article ("selection"/digest). */
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
  const lines = items.map(
    (i) => `• [${i.type}] ${i.title}${i.summary ? ` — ${i.summary}` : ''}`,
  )
  let intro = `이번 다이제스트에는 ${items.length}개의 새로운 항목이 있습니다.`
  try {
    const ai = await claudeIntro(items, dateStr)
    if (ai) intro = ai
  } catch {
    /* fall back to deterministic intro */
  }
  const bodyText = [intro, '', ...lines].join('\n')

  const article = await payload.create({
    collection: 'articles',
    data: {
      title,
      slug: `digest-${dateStr}-${items.length}${lines.length}`,
      summary: intro,
      body: plaintextToLexical(bodyText),
      curatedItems: items.map((i) => ({ relationTo: i.type, value: i.id })),
      generatedBy: 'ai',
      publishedAt: `${dateStr}T00:00:00.000Z`,
    },
  })
  return article
}

/** "Send" the digest to active subscribers (dev: console; prod: listmonk seam). */
export async function sendDigest(
  payload: Payload,
  article: { id: number | string; title: string; summary?: string | null },
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

  if (process.env.LISTMONK_URL) {
    try {
      await pushToListmonk(article.title, `<p>${article.summary ?? ''}</p>`, recipients)
    } catch (err) {
      console.error('[newsletter] listmonk send failed:', err)
    }
  } else {
    console.log(
      `[newsletter] (dev) "${article.title}" -> ${recipients.length} subscriber(s): ${recipients.join(', ') || '(none)'}`,
    )
  }

  await payload.update({
    collection: 'articles',
    id: article.id,
    data: { sentAsNewsletter: true },
  })
  return { recipients: recipients.length }
}
