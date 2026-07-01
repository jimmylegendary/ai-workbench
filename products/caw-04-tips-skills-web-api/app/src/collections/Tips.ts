import type { CollectionConfig } from 'payload'

import { isAuthenticated, isAuthorOrStaff } from '../access/roles'

// An atomic AI-usage tip.
export const Tips: CollectionConfig = {
  slug: 'tips',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'summary', 'author', 'updatedAt'],
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
    { name: 'body', type: 'richText' },
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
