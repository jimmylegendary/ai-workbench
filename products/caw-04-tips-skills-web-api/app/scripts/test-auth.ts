import 'dotenv/config'
import crypto from 'crypto'
import { getPayload } from 'payload'

import config from '../src/payload.config'

const run = async () => {
  const payload = await getPayload({ config: await config })
  const email = `invite-test-${Date.now()}@caw04.local`

  const u = await payload.create({
    collection: 'users',
    data: { email, password: crypto.randomUUID(), roles: ['member'], name: 'Invite Test' },
  })
  console.log('created user', u.id, u.email)

  const token = await payload.forgotPassword({
    collection: 'users',
    data: { email },
    disableEmail: true,
  })
  console.log('forgotPassword token:', typeof token, String(token).slice(0, 16) + '…')

  const reset = await payload.resetPassword({
    collection: 'users',
    data: { token: String(token), password: 'newpass123' },
    overrideAccess: true,
  })
  console.log('resetPassword ->', { user: reset.user?.email, tokenLen: reset.token?.length })

  const login = await payload.login({
    collection: 'users',
    data: { email, password: 'newpass123' },
  })
  console.log('login ->', { user: login.user?.email, tokenLen: login.token?.length, exp: login.exp })

  await payload.delete({ collection: 'users', id: u.id })
  console.log('cleaned up')
  process.exit(0)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
