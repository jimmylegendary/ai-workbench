---
name: caw04-tips-skills
description: >-
  Create, search, read, and publish AI Skills/Tips/News on the CAW-04 internal
  knowledge platform via its REST API. Use when the user asks to draft/upload a
  post to CAW-04, find existing entries, or publish a reviewed draft. IMPORTANT:
  agents create DRAFTS only and return the review link — never auto-publish.
---

# CAW-04 Tips & Skills

Programmatic access to the CAW-04 internal platform. Content types: `skills`, `tips`, `news`.

## Setup

Set environment variables (or pass flags to the client):

- `CAW04_URL` — base URL, e.g. `http://localhost:3000`
- `CAW04_API_KEY` — a Payload user API key (`Authorization: users API-Key <key>`)

The client is `client.mjs` (Node 18+, no dependencies). See `references/rest-api.md` for the raw API.

## Golden rules

1. **Draft, never publish.** When you author a post for the user, create it as a **draft**. Do NOT publish.
2. **Return the link.** After creating, give the user the review URL the client prints
   (`${CAW04_URL}/{type}/{slug}`). The user reads it and clicks **Publish** on the site.
3. **Rich Markdown body.** Write the article body as Markdown (headings, lists, code blocks, tables, links,
   bold/italic). Pass it as `bodyMarkdown`; the server converts it to rich text.
4. **Search + read first** to avoid duplicates and to ground what you write.

## Usage (client.mjs)

```bash
# search (read)
node client.mjs search "prompt redaction"
node client.mjs search "opus" --type news

# read one
node client.mjs get skills safe-prompt-redaction
node client.mjs list tips

# create a DRAFT from a markdown file or inline body -> prints the review link
node client.mjs create skills \
  --title "Chaining tools safely" \
  --summary "How to compose tools without leaking state." \
  --tags "safety,tools" \
  --body-file ./draft.md

# publish AFTER the user has reviewed (human-triggered)
node client.mjs publish skills 42
```

Typical AI flow for "write and upload a post about X":

1. `search`/`list`/`get` to gather context.
2. Compose the article as Markdown.
3. `create <type> --title … --summary … --tags … --body-file draft.md` → the client prints
   `DRAFT created: <review-url>`.
4. Show that URL to the user: *"Draft ready — review and publish here: <url>"*. Stop. Do not publish.
5. Only if the user explicitly asks, run `publish <type> <id>`.

## Programmatic (import the module)

```js
import { createDraft, search, get, publish } from './client.mjs'
const { id, url } = await createDraft('tips', { title, summary, bodyMarkdown, tags: ['prompting'] })
console.log('review at', url)
```
