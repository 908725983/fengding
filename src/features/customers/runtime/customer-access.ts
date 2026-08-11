import type { CustomerRole } from '../types'

let currentRole: CustomerRole = 'super-admin'

export function setCurrentCustomerRole(role: CustomerRole): void { currentRole = role }
export function canCurrentRoleAccessCustomers(): boolean { return ['super-admin', 'sales-supervisor', 'salesperson'].includes(currentRole) }
export function guardCustomerSubroute(path: string): true | string {
  if (!path.startsWith('/customers/') || canCurrentRoleAccessCustomers()) return true
  return '/customers?denied=1'
}
