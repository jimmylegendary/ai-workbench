import type { Access } from 'payload'

type Role = 'admin' | 'curator' | 'member'

const rolesOf = (user: unknown): Role[] => {
  const r = (user as { roles?: Role[] } | null | undefined)?.roles
  return Array.isArray(r) ? r : []
}

export const isAuthenticated: Access = ({ req: { user } }) => Boolean(user)

export const isAdmin: Access = ({ req: { user } }) => rolesOf(user).includes('admin')

export const isAdminOrCurator: Access = ({ req: { user } }) =>
  rolesOf(user).some((role) => role === 'admin' || role === 'curator')
