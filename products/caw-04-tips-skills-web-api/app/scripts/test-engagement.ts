import 'dotenv/config'
import { getPayload } from 'payload'

import config from '../src/payload.config'
import {
  getEngagement,
  incrementView,
  toggleFavorite,
  toggleLike,
} from '../src/lib/engagement'

const run = async () => {
  const payload = await getPayload({ config: await config })
  const skill = (await payload.find({ collection: 'skills', limit: 1 })).docs[0]
  const user = (await payload.find({ collection: 'users', limit: 1 })).docs[0]
  if (!skill || !user) throw new Error('need a seeded skill + user (run pnpm seed)')
  console.log(`item: skills#${skill.id} "${skill.title}"  user#${user.id}`)

  console.log('before   ', await getEngagement(payload, 'skills', skill.id, user.id))
  console.log('like     ', await toggleLike(payload, 'skills', skill.id, user.id))
  console.log('favorite ', await toggleFavorite(payload, 'skills', skill.id, user.id))
  console.log('view     ', await incrementView(payload, 'skills', skill.id))
  console.log('view     ', await incrementView(payload, 'skills', skill.id))
  console.log('state    ', await getEngagement(payload, 'skills', skill.id, user.id))
  console.log('unlike   ', await toggleLike(payload, 'skills', skill.id, user.id))
  console.log('after    ', await getEngagement(payload, 'skills', skill.id, user.id))
  process.exit(0)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
