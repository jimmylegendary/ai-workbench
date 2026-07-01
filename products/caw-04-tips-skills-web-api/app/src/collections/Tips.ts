import type { CollectionConfig } from 'payload'

import { isAdminOrCurator, isAuthenticated } from '../access/roles'

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
      admin: { position: 'sidebar' },
    },
  ],
}
