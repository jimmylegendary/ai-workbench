import type { CollectionConfig } from 'payload'

import { isAdminOrCurator, isAuthenticated } from '../access/roles'

// Newsletter subscription (one per user). Digest jobs email active subscribers.
export const Subscriptions: CollectionConfig = {
  slug: 'subscriptions',
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['email', 'user', 'active'],
    group: 'Engagement',
  },
  access: {
    read: isAuthenticated,
    create: isAuthenticated,
    update: isAuthenticated,
    delete: isAdminOrCurator,
  },
  fields: [
    { name: 'user', type: 'relationship', relationTo: 'users', required: true },
    { name: 'email', type: 'email' },
    { name: 'active', type: 'checkbox', defaultValue: true },
  ],
}
