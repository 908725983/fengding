import type { InventoryRole } from '../types'

let currentRole: InventoryRole = 'super-admin'
export function setCurrentInventoryRole(role: InventoryRole): void { currentRole = role }
export function canCurrentRoleAccessInventory(): boolean { return ['super-admin', 'warehouse', 'sales-supervisor'].includes(currentRole) }
export function guardInventorySubroute(path: string): true | string {
  if (!path.startsWith('/inventory')) return true
  if (!canCurrentRoleAccessInventory()) return '/inventory/stocks?denied=1'
  const writeRoute = /^\/inventory\/(warehouses|locations)\/(new|[^/]+\/edit)$/.test(path)
  if (writeRoute && !['super-admin', 'warehouse'].includes(currentRole)) return '/inventory/stocks?denied=1'
  return true
}
