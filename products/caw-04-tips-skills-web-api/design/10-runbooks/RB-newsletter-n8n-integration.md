# Runbook — Newsletter delivery via n8n (webhook / MCP)

- **Status:** ready
- **Owner:** Jimmy
- **Applies to:** `app/` (Payload+Next). CAW-04 does **not** send email via SMTP. The digest send POSTs to an
  n8n webhook; the n8n workflow (webhook trigger + your email/MCP nodes) performs actual delivery.

## What the app already does

`sendDigest()` (`app/src/lib/digest.ts`) collects active subscribers and, when `N8N_WEBHOOK_URL` is set,
`POST`s the payload below to that URL (optional `Authorization: Bearer <N8N_WEBHOOK_TOKEN>`). Then it marks
the `Article.sentAsNewsletter = true`. With no URL set it just logs (dev).

**Env** (`app/.env`):

```
N8N_WEBHOOK_URL=https://<your-n8n>/webhook/caw04-digest
N8N_WEBHOOK_TOKEN=<optional-shared-secret>
```

**Outbound payload** (JSON):

```jsonc
{
  "subject": "AI 다이제스트 — 2026-07-02",
  "summary": "이번 다이제스트에는 8개의 새로운 항목이 있습니다.",
  "articleId": 42,
  "articleSlug": "digest-2026-07-02-88",
  "recipients": ["a@corp.com", "b@corp.com"]   // active subscribers' emails
}
```

Triggered by: the **Generate digest** button on `/me` (admin/curator), `pnpm digest`, or the scheduled job
(see `RB-scheduled-digest.md`).

## Option A — n8n Webhook workflow (simplest)

1. In n8n, add a **Webhook** node (HTTP `POST`, path e.g. `caw04-digest`). Copy its Production URL →
   `N8N_WEBHOOK_URL`. If you want auth, enable Header Auth on the node and set the same value in
   `N8N_WEBHOOK_TOKEN` (the app sends `Authorization: Bearer <token>`).
2. (Optional) Fetch the full article body: add an **HTTP Request** node →
   `GET {APP_URL}/api/articles/{{$json.articleId}}` with header
   `Authorization: users API-Key <agent key>` (see the app README for the agent key) to enrich the email.
3. Add a **Split Out** (or Item Lists) node over `{{$json.recipients}}` to iterate one email per recipient
   (or pass the array straight to a provider that accepts BCC).
4. Add your email node (Gmail / SES / SMTP-in-n8n / Resend / etc.). Map `subject` and a body built from
   `summary` (+ the fetched article body / a link `{APP_URL}/articles/{{$json.articleSlug}}`).
5. Return `200` from the workflow. The app treats any non-2xx as a failed send (logged, non-fatal).

**Have an AI wire it:** give the assistant this runbook + your n8n instance details (and, if using MCP,
your MCP server), and ask it to build the workflow that consumes the payload above and sends via your
provider. The only contract it must honor is the inbound payload shape and returning 2xx.

## Option B — MCP-based delivery

If your delivery lives behind an **MCP** server (tools like `send_email` / `create_campaign`):

- Keep the same app→n8n webhook trigger, and in n8n use the **MCP Client** node (or an AI Agent node with
  your MCP server attached) to call your email tool per recipient, mapping the payload fields.
- Or, if you prefer app→MCP directly (no n8n): that needs a small MCP-client call added to `sendDigest`.
  Not implemented (kept generic via the webhook). Ask to add an `MCP_*` seam if you want this path.

## Test

1. Set `N8N_WEBHOOK_URL` (+ token) in `app/.env`, restart `pnpm dev`.
2. Subscribe a test user (`/me` → 구독), then `/me` → **Generate digest** (admin) or `pnpm digest`.
3. Confirm the n8n execution fired with the payload and your provider sent the mail.
4. Local smoke test without n8n: `pnpm exec tsx scripts/verify-n8n.ts` (stub listener asserts the POST body).

## Notes / to decide with your workflow

- **Per-recipient vs bulk**: app sends the whole `recipients[]`; split in n8n if your provider needs one call
  per address. If you'd rather the app send one webhook per recipient, ask to change `sendDigest`.
- **Unsubscribe links**: include `{APP_URL}/me` (subscription toggle) in the template; a token-based
  one-click unsubscribe is a later enhancement.
- **Idempotency**: `sentAsNewsletter` is set after the POST; a retry would resend. Add a guard if needed.
