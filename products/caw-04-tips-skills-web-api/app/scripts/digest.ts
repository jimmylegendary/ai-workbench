import 'dotenv/config'
import { getPayload } from 'payload'

import config from '../src/payload.config'
import { generateDigest, sendDigest } from '../src/lib/digest'

// CLI entry for the AI curation + newsletter job (cron/manual).
// Uses Claude if ANTHROPIC_API_KEY is set; sends via listmonk if LISTMONK_URL is set.
const run = async () => {
  const payload = await getPayload({ config: await config })
  const dateStr = new Date().toISOString().slice(0, 10)
  const article = await generateDigest(payload, dateStr)
  const res = await sendDigest(payload, article)
  console.log(
    `digest: created "${article.slug}" (id ${article.id}); sent to ${res.recipients} subscriber(s)`,
  )
  process.exit(0)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
