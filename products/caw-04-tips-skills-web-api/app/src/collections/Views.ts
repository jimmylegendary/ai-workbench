import type { CollectionConfig } from 'payload'

import { isAdminOrCurator, isAuthenticated } from '../access/roles'

// Per-item view counter (one row per content item, incremented server-side).
export const Views: CollectionConfig = {
  slug: 'views',
  admin: {
    useAsTitle: 'id',
    defaultColumns: ['item', 'count', 'updatedAt'],
    group: 'Engagement',
  },
  access: {
    read: isAuthenticated,
    create: isAuthenticated,
    update: isAuthenticated,
    delete: isAdminOrCurator,
  },
  fields: [
    {
      name: 'item',
      type: 'relationship',
      relationTo: ['skills', 'tips', 'news', 'articles'],
      required: true,
    },
    { name: 'count', type: 'number', defaultValue: 0 },
  ],
}
