import type { CollectionConfig } from 'payload'

import { isAdminOrCurator, isAuthenticated } from '../access/roles'

// An AI-related news item (link + optional commentary).
export const News: CollectionConfig = {
  slug: 'news',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'source', 'publishedAt', 'author'],
    group: 'Content',
  },
  versions: { drafts: true },
  access: {
    read: isAuthenticated,
    create: isAuthenticated,
    update: isAuthenticated,
    delete: isAdminOrCurator,
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    {
      name: 'slug',
      type: 'text',
      unique: true,
      index: true,
      admin: { position: 'sidebar' },
    },
    { name: 'summary', type: 'textarea' },
    { name: 'url', type: 'text' },
    { name: 'source', type: 'text' },
    { name: 'body', type: 'richText' },
    { name: 'publishedAt', type: 'date', admin: { position: 'sidebar' } },
    {
      name: 'tags',
      type: 'array',
      fields: [{ name: 'tag', type: 'text', required: true }],
    },
    {
      name: 'author',
      type: 'relationship',
      relationTo: 'users',
      admin: { position: 'sidebar' },
    },
  ],
}
