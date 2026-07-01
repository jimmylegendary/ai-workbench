import type { CollectionConfig } from 'payload'

import { isAuthenticated, isAuthorOrStaff } from '../access/roles'

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
    update: isAuthorOrStaff,
    delete: isAuthorOrStaff,
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
      defaultValue: ({ req }) => req?.user?.id,
      admin: { position: 'sidebar' },
    },
  ],
}
