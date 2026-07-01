import type { CollectionConfig } from 'payload'

import { isAuthenticated, isAuthorOrStaff } from '../access/roles'

// A reusable Skill: rich, typed metadata (inputs/outputs/preconditions/
// provenance) + edit history via drafts/versions. No semver/immutable versions.
export const Skills: CollectionConfig = {
  slug: 'skills',
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
      name: 'inputs',
      type: 'array',
      labels: { singular: 'Input', plural: 'Inputs' },
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'type', type: 'text' },
        { name: 'required', type: 'checkbox', defaultValue: false },
        { name: 'description', type: 'text' },
      ],
    },
    {
      name: 'outputs',
      type: 'array',
      labels: { singular: 'Output', plural: 'Outputs' },
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'type', type: 'text' },
        { name: 'description', type: 'text' },
      ],
    },
    {
      name: 'preconditions',
      type: 'array',
      fields: [{ name: 'value', type: 'text', required: true }],
    },
    {
      name: 'provenance',
      type: 'group',
      fields: [
        { name: 'sourceProduct', type: 'text' },
        { name: 'sourceRef', type: 'text' },
        { name: 'validated', type: 'checkbox', defaultValue: false },
        { name: 'notes', type: 'textarea' },
      ],
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
