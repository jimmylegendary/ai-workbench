import type { CollectionConfig } from 'payload'

import { isAdminOrCurator, isAuthenticated } from '../access/roles'

// AI-generated articles / curated "selections" (digests). Produced by a
// scheduled job (Claude) and optionally sent as a newsletter via listmonk.
export const Articles: CollectionConfig = {
  slug: 'articles',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'generatedBy', 'sentAsNewsletter', 'publishedAt'],
    group: 'Curation',
  },
  versions: { drafts: true },
  access: {
    read: isAuthenticated,
    create: isAdminOrCurator,
    update: isAdminOrCurator,
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
      name: 'curatedItems',
      type: 'relationship',
      relationTo: ['skills', 'tips', 'news'],
      hasMany: true,
    },
    {
      name: 'generatedBy',
      type: 'select',
      defaultValue: 'ai',
      options: [
        { label: 'AI', value: 'ai' },
        { label: 'Human', value: 'human' },
      ],
      admin: { position: 'sidebar' },
    },
    {
      name: 'sentAsNewsletter',
      type: 'checkbox',
      defaultValue: false,
      admin: { position: 'sidebar' },
    },
    { name: 'publishedAt', type: 'date', admin: { position: 'sidebar' } },
  ],
}
