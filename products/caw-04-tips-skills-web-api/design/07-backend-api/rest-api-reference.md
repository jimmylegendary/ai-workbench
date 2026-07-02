# CAW-04 REST API reference

Base URL: `${CAW04_URL}` (e.g. `http://localhost:3000`). All programmatic calls authenticate with an API key:

```
Authorization: users API-Key <CAW04_API_KEY>
```

(The dev seed key is `caw04-agent-dev-key-0123456789`; issue per-user keys in `/admin`.)

`{type}` ∈ `skills | tips | news`. Payload auto-generates REST/GraphQL for every collection; the endpoints below
are the ones the agent skill uses.

## Read

| Method | Path | Notes |
|---|---|---|
| GET | `/api/{type}?limit=20&page=1&depth=0` | list (published + your drafts if authed) |
| GET | `/api/{type}/{id}` | one by id |
| GET | `/api/{type}?where[slug][equals]={slug}&limit=1` | one by slug |
| GET | `/api/search?q={q}&type={type}` | cross-type search (title/summary/tags), **auth required** |
| GET | `/index.json` · `/llms.txt` · `/rss.xml` | discovery / feeds (published only) |

## Write (create as DRAFT — do NOT auto-publish)

```
POST /api/{type}
Authorization: users API-Key <key>
Content-Type: application/json

{
  "title": "…",                     // required; slug auto-generated from title if omitted
  "summary": "…",
  "bodyMarkdown": "## Heading\n\n- rich **markdown** …",  // converted to rich text server-side
  "tags": [{ "tag": "prompting" }],
  "_status": "draft"                // create as draft (default). Never publish automatically.
}
```

Response `201` → `{ doc: { id, slug, _status, … } }`. Build the **review link**: `${CAW04_URL}/{type}/{slug}`
and show it to the user. `author` is set automatically from the API key's user.

- Update: `PATCH /api/{type}/{id}` with any subset of the same fields (`bodyMarkdown` re-converts the body).

## Publish (human action)

A human reviews the draft link, then publishes. Programmatically the same is:

```
PATCH /api/{type}/{id}
{ "_status": "published" }
```

Only published items appear in public lists, search, `/index.json`, `/llms.txt`, `/rss.xml`.

## Rules for AI agents

1. **Author as a draft.** Always send `_status: "draft"` on create. Never publish on the user's behalf.
2. **Return the link.** After creating, surface `${CAW04_URL}/{type}/{slug}` so the user can read + publish.
3. **Rich format.** Put the article body in `bodyMarkdown` (Markdown: headings, lists, code, links, bold, tables).
4. **Search/read freely** to gather context before writing.
