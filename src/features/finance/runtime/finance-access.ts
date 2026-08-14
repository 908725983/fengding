import type { FinanceRole } from '../types'

let currentRole: FinanceRole = 'super-admin'
export function setCurrentFinanceRole(role: FinanceRole): void { currentRole = role }
export function canCurrentRoleAccessFinance(): boolean { return ['super-admin', 'finance', 'sales-supervisor'].includes(currentRole) }
export function guardFinanceSubroute(path: string): true | string {
  if (!path.startsWith('/finance')) return true
  if (!canCurrentRoleAccessFinance()) return '/dashboard?denied=finance'
  const writeArea = /^\/finance\/(accounts\/(new|[^/]+\/edit)|carryovers|banks|payment-channels)/.test(path)
  if (writeArea && currentRole === 'sales-supervisor') return '/finance/accounts?denied=1'
  return true
}
