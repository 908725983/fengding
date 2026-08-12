import type { ProductRole } from '../types'

let currentRole: ProductRole = 'super-admin'

export function setCurrentProductRole(role: ProductRole): void { currentRole = role }
export function canCurrentRoleAccessProducts(): boolean { return currentRole !== 'finance' }
export function guardProductSubroute(path: string): true | string {
  const priceWriteRoute = /^\/products\/prices\/(level|purchase|customer)-adjustments\/(new|[^/]+\/edit)$/.test(path)
    || /^\/products\/prices\/(order-unit-prices|strategies)\/(new|[^/]+\/edit)$/.test(path)
  const authorizationWriteRoute = /^\/products\/authorizations\/(plans|rules)\/(new|[^/]+\/edit)$/.test(path)
  const distributionWriteRoute = /^\/products\/distribution\/plans\/(new|[^/]+\/edit)$/.test(path) || /^\/products\/order-templates\/(new|[^/]+\/edit)$/.test(path)
  if (priceWriteRoute && currentRole !== 'super-admin') return '/products/prices/level-adjustments?denied=1'
  if (authorizationWriteRoute && currentRole !== 'super-admin') return '/products/authorizations/plans?denied=1'
  if (distributionWriteRoute && currentRole !== 'super-admin') return '/products/distribution/plans?denied=1'
  if (path.startsWith('/products/authorizations/') && !['super-admin', 'sales-supervisor'].includes(currentRole)) return '/products?denied=1'
  if ((path.startsWith('/products/distribution/') || path.startsWith('/products/order-templates')) && !['super-admin', 'sales-supervisor'].includes(currentRole)) return '/products?denied=1'
  if (!path.startsWith('/products/') || canCurrentRoleAccessProducts()) return true
  return '/products?denied=1'
}
