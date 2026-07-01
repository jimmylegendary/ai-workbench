import type { CollectionConfig } from 'payload'

import { isAuthenticated } from '../access/roles'

// A "like" reaction by a user on any content item (polymorphic target).
// App logic enforces one reaction per (user, item, kind).
export const Reactions: CollectionConfig = {
  slug: 'reactions',
  admin: {
    useAsTitle: 'kind',
    defaultColumns: ['kind', 'user', 'item', 'createdAt'],
    group: 'Engagement',
  },
  access: {
    read: isAuthenticated,
    create: isAuthenticated,
    update: isAuthenticated,
    delete: isAuthenticated,
  },
  fields: [
    { name: 'user', type: 'relationship', relationTo: 'users', required: true },
    {
      name: 'item',
      type: 'relationship',
      relationTo: ['skills', 'tips', 'news', 'articles'],
      required: true,
    },
    {
      name: 'kind',
      type: 'select',
      defaultValue: 'like',
      options: [{ label: 'Like', value: 'like' }],
    },
  ],
}
