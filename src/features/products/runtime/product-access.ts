import type { ProductRole } from '../types'

let currentRole: ProductRole = 'super-admin'

export function setCurrentProductRole(role: ProductRole): void { currentRole = role }
export function canCurrentRoleAccessProducts(): boolean { return currentRole !== 'finance' }
export function guardProductSubroute(path: string): true | string {
  const priceWriteRoute = /^\/products\/prices\/(level|purchase|customer)-adjustments\/(new|[^/]+\/edit)$/.test(path)
    || /^\/products\/prices\/(order-unit-prices|strategies)\/(new|[^/]+\/edit)$/.test(path)
  if (priceWriteRoute && currentRole !== 'super-admin') return '/products/prices/level-adjustments?denied=1'
  if (!path.startsWith('/products/') || canCurrentRoleAccessProducts()) return true
  return '/products?denied=1'
}
