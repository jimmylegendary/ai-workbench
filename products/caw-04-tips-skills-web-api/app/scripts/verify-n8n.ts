import http from 'node:http'

import { sendDigest } from '../src/lib/digest'

// Standalone test: stub payload + a local listener standing in for the n8n webhook.
const run = async () => {
  let received: string | null = null
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      received = body
      res.statusCode = 200
      res.end('ok')
    })
  })
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const port = (server.address() as { port: number }).port
  process.env.N8N_WEBHOOK_URL = `http://127.0.0.1:${port}/webhook/test`

  const fakePayload = {
    find: async () => ({ docs: [{ email: 'a@caw04.local' }, { email: 'b@caw04.local' }] }),
    update: async () => ({}),
  } as unknown as Parameters<typeof sendDigest>[0]

  const res = await sendDigest(fakePayload, {
    id: 123,
    title: 'AI 다이제스트 — test',
    summary: 'test summary',
    slug: 'digest-test',
  })

  await new Promise((r) => setTimeout(r, 200))
  server.close()
  console.log('sendDigest recipients:', res.recipients)
  console.log('n8n webhook received:', received)
  process.exit(received ? 0 : 1)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
