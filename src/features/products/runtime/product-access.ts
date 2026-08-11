import type { ProductRole } from '../types'

let currentRole: ProductRole = 'super-admin'

export function setCurrentProductRole(role: ProductRole): void { currentRole = role }
export function canCurrentRoleAccessProducts(): boolean { return currentRole !== 'finance' }
export function guardProductSubroute(path: string): true | string {
  if (!path.startsWith('/products/') || canCurrentRoleAccessProducts()) return true
  return '/products?denied=1'
}
