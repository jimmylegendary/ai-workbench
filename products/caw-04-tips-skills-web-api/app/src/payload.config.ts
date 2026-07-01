import { postgresAdapter } from '@payloadcms/db-postgres'
import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Skills } from './collections/Skills'
import { Tips } from './collections/Tips'
import { News } from './collections/News'
import { Articles } from './collections/Articles'
import { Reactions } from './collections/Reactions'
import { Favorites } from './collections/Favorites'
import { Views } from './collections/Views'
import { searchContent } from './lib/search'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

// Local dev defaults to SQLite (zero infra); production sets DATABASE_URI to a
// Postgres connection string and the postgres adapter is used automatically.
const databaseURI = process.env.DATABASE_URI || 'file:./caw04.db'
const db = databaseURI.startsWith('postgres')
  ? postgresAdapter({ pool: { connectionString: databaseURI } })
  : sqliteAdapter({ client: { url: databaseURI } })

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Users, Media, Skills, Tips, News, Articles, Reactions, Favorites, Views],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db,
  sharp,
  endpoints: [
    {
      // GET /api/search?q=...&type=skills|tips|news  (auth required; agents use API key)
      path: '/search',
      method: 'get',
      handler: async (req) => {
        if (!req.user) {
          return Response.json({ error: 'unauthorized' }, { status: 401 })
        }
        const q = typeof req.query?.q === 'string' ? req.query.q : ''
        const typeParam = typeof req.query?.type === 'string' ? req.query.type : ''
        const types =
          typeParam && ['skills', 'tips', 'news'].includes(typeParam)
            ? [typeParam as 'skills' | 'tips' | 'news']
            : undefined
        const results = await searchContent(req.payload, q, { types })
        return Response.json({ query: q, count: results.length, results })
      },
    },
  ],
  plugins: [],
})
