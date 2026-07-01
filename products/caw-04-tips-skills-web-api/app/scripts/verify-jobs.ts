import 'dotenv/config'
import { getPayload } from 'payload'

import config from '../src/payload.config'

// Verifies the digest task runs via the Jobs Queue (queue + run in-process).
const run = async () => {
  const payload = await getPayload({ config: await config })
  const before = (await payload.count({ collection: 'articles' })).totalDocs
  await payload.jobs.queue({ task: 'digest', input: {}, queue: 'digests' })
  await payload.jobs.run({ queue: 'digests' })
  const after = (await payload.count({ collection: 'articles' })).totalDocs
  console.log(`articles before=${before} after=${after} (created ${after - before})`)
  process.exit(after > before ? 0 : 1)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
