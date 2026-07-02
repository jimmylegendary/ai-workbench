# CAW-04 REST API (for the skill)

Auth on every call: `Authorization: users API-Key <CAW04_API_KEY>`. `{type}` ∈ `skills | tips | news`.

## Read
- `GET /api/{type}?limit=20&page=1&depth=0` — list
- `GET /api/{type}/{id}` — by id
- `GET /api/{type}?where[slug][equals]={slug}&limit=1` — by slug
- `GET /api/search?q={q}&type={type}` — search (title/summary/tags), auth required
- `GET /index.json` · `/llms.txt` · `/rss.xml` — discovery/feeds (published only)

## Create a DRAFT (never publish automatically)
```
POST /api/{type}
{ "title": "...", "summary": "...", "bodyMarkdown": "## rich **markdown** ...",
  "tags": [{"tag":"prompting"}], "_status": "draft" }
```
- `slug` auto-generated from `title` if omitted. `author` set from the API key user.
- `bodyMarkdown` is converted to rich text (lexical) server-side. Response: `{ doc: { id, slug, ... } }`.
- Review link = `${CAW04_URL}/{type}/{slug}` — show this to the user.

## Update / Publish
- `PATCH /api/{type}/{id}` — any subset (`bodyMarkdown` re-converts body).
- Publish (human action): `PATCH /api/{type}/{id}` with `{ "_status": "published" }`.

Only published items appear in public lists, `/api/search`, `/index.json`, `/llms.txt`, `/rss.xml`.
