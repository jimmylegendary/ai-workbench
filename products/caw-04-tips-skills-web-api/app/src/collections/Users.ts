import type { CollectionConfig } from 'payload'

// Internal members only. Signup is invite-driven (admin creates users); roles
// gate curation/admin actions. No external IdP in v1 (email/password).
export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['name', 'email', 'roles'],
  },
  auth: true,
  fields: [
    { name: 'name', type: 'text' },
    {
      name: 'roles',
      type: 'select',
      hasMany: true,
      defaultValue: ['member'],
      options: [
        { label: 'Admin', value: 'admin' },
        { label: 'Curator', value: 'curator' },
        { label: 'Member', value: 'member' },
      ],
    },
  ],
}
