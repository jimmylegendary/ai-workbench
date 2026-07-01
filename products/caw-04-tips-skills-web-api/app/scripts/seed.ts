import 'dotenv/config'
import { getPayload } from 'payload'

import config from '../src/payload.config'

const SKILLS = [
  {
    slug: 'safe-prompt-redaction',
    title: 'Safe prompt redaction',
    summary: 'Strip identifiers before sending text to an LLM.',
    tags: [{ tag: 'safety' }, { tag: 'redaction' }],
    provenance: { sourceProduct: 'CAW-03', validated: true },
  },
  {
    slug: 'structured-extraction',
    title: 'Structured extraction with schemas',
    summary: 'Coax reliable JSON out of a model with a typed schema and retries.',
    tags: [{ tag: 'extraction' }, { tag: 'json' }],
    provenance: { validated: false },
  },
  {
    slug: 'agent-write-api',
    title: 'Post content via the write API',
    summary: 'Authenticate a connected skill and create tips/skills/news programmatically.',
    tags: [{ tag: 'api' }, { tag: 'automation' }],
    provenance: { sourceProduct: 'CAW-04', validated: true },
  },
]

const run = async () => {
  const payload = await getPayload({ config: await config })

  const email = 'admin@caw04.local'
  const existing = await payload.find({
    collection: 'users',
    where: { email: { equals: email } },
    limit: 1,
  })
  let admin = existing.docs[0]
  if (!admin) {
    admin = await payload.create({
      collection: 'users',
      data: {
        email,
        password: 'changeme123',
        name: 'CAW-04 Admin',
        roles: ['admin'],
      },
    })
    console.log(`seed: created admin ${email} (password: changeme123)`)
  }

  for (const s of SKILLS) {
    const found = await payload.find({
      collection: 'skills',
      where: { slug: { equals: s.slug } },
      limit: 1,
    })
    if (!found.docs.length) {
      await payload.create({ collection: 'skills', data: { ...s, author: admin.id } })
      console.log(`seed: created skill ${s.slug}`)
    }
  }

  console.log('seed: done')
  process.exit(0)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
