#!/usr/bin/env node
// CAW-04 REST client for agents. Node 18+, no dependencies.
// Env: CAW04_URL, CAW04_API_KEY  (or --url / --key flags)
import { readFileSync } from 'node:fs'

const TYPES = ['skills', 'tips', 'news']

function cfg(flags = {}) {
  const url = (flags.url || process.env.CAW04_URL || 'http://localhost:3000').replace(/\/$/, '')
  const key = flags.key || process.env.CAW04_API_KEY
  if (!key) throw new Error('Set CAW04_API_KEY (or pass --key)')
  return { url, headers: { Authorization: `users API-Key ${key}`, 'content-type': 'application/json' } }
}

async function api(path, init, flags) {
  const { url, headers } = cfg(flags)
  const res = await fetch(url + path, { ...init, headers: { ...headers, ...(init?.headers || {}) } })
  const text = await res.text()
  let body
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  if (!res.ok) throw new Error(`${res.status} ${path}: ${typeof body === 'string' ? body : JSON.stringify(body)}`)
  return body
}

export async function search(q, { type, ...flags } = {}) {
  const qs = new URLSearchParams({ q })
  if (type) qs.set('type', type)
  return api(`/api/search?${qs}`, {}, flags)
}

export async function list(type, { limit = 20, page = 1, ...flags } = {}) {
  return api(`/api/${type}?limit=${limit}&page=${page}&depth=0`, {}, flags)
}

export async function get(type, slug, flags = {}) {
  const r = await api(`/api/${type}?where[slug][equals]=${encodeURIComponent(slug)}&limit=1&depth=0`, {}, flags)
  return r.docs?.[0] ?? null
}

// Creates a DRAFT (never published). Returns { id, slug, url }.
export async function createDraft(type, { title, summary, bodyMarkdown, tags = [], ...flags } = {}) {
  if (!TYPES.includes(type)) throw new Error(`type must be one of ${TYPES.join('|')}`)
  const data = {
    title,
    summary,
    bodyMarkdown,
    tags: (tags || []).map((t) => (typeof t === 'string' ? { tag: t } : t)),
    _status: 'draft',
  }
  const r = await api(`/api/${type}`, { method: 'POST', body: JSON.stringify(data) }, flags)
  const doc = r.doc ?? r
  const base = (flags.url || process.env.CAW04_URL || 'http://localhost:3000').replace(/\/$/, '')
  return { id: doc.id, slug: doc.slug, url: `${base}/${type}/${doc.slug}` }
}

export async function publish(type, id, flags = {}) {
  return api(`/api/${type}/${id}`, { method: 'PATCH', body: JSON.stringify({ _status: 'published' }) }, flags)
}

// ── CLI ──────────────────────────────────────────────────────────────────────
function parseFlags(argv) {
  const flags = {}
  const rest = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) flags[a.slice(2)] = argv[++i]
    else rest.push(a)
  }
  return { flags, rest }
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2)
  const { flags, rest } = parseFlags(args)
  try {
    if (cmd === 'search') {
      const r = await search(rest[0], flags)
      console.log(JSON.stringify(r, null, 2))
    } else if (cmd === 'list') {
      const r = await list(rest[0], flags)
      console.log(JSON.stringify(r.docs?.map((d) => ({ id: d.id, slug: d.slug, title: d.title, _status: d._status })), null, 2))
    } else if (cmd === 'get') {
      console.log(JSON.stringify(await get(rest[0], rest[1], flags), null, 2))
    } else if (cmd === 'create') {
      const bodyMarkdown = flags['body-file'] ? readFileSync(flags['body-file'], 'utf8') : flags.body
      const tags = flags.tags ? flags.tags.split(',').map((s) => s.trim()).filter(Boolean) : []
      const { id, slug, url } = await createDraft(rest[0], {
        title: flags.title,
        summary: flags.summary,
        bodyMarkdown,
        tags,
        url: flags.url,
        key: flags.key,
      })
      console.log(`DRAFT created: ${url}\n(id ${id}, slug ${slug}) — review and publish on the site; do not auto-publish.`)
    } else if (cmd === 'publish') {
      await publish(rest[0], rest[1], flags)
      console.log(`published ${rest[0]} ${rest[1]}`)
    } else {
      console.log('usage: client.mjs <search|list|get|create|publish> ... (see SKILL.md)')
      process.exit(1)
    }
  } catch (err) {
    console.error('error:', err.message)
    process.exit(1)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main()
