import 'dotenv/config'
import { getPayload } from 'payload'

import config from '../src/payload.config'

// One-time backfill: mark existing content published (drafts are a new concept).
const run = async () => {
  const payload = await getPayload({ config: await config })
  for (const collection of ['skills', 'tips', 'news', 'articles'] as const) {
    const res = await payload.update({
      collection,
      where: { id: { exists: true } },
      data: { _status: 'published' },
      overrideAccess: true,
    })
    console.log(`${collection}: published ${res.docs?.length ?? 0}, errors ${res.errors?.length ?? 0}`)
  }
  process.exit(0)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
