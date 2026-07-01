import type { CollectionConfig } from 'payload'

import { isAuthenticated } from '../access/roles'

// A user's bookmark/favorite of any content item (polymorphic target).
export const Favorites: CollectionConfig = {
  slug: 'favorites',
  admin: {
    useAsTitle: 'id',
    defaultColumns: ['user', 'item', 'createdAt'],
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
  ],
}
