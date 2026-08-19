import type { ProcurementRole } from '../types'
import { ref } from 'vue'

export const currentProcurementRole = ref<ProcurementRole>('super-admin')
export function setCurrentProcurementRole(role: ProcurementRole): void { currentProcurementRole.value = role }
export function canCurrentRoleAccessProcurement(): boolean { return currentProcurementRole.value === 'super-admin' || currentProcurementRole.value === 'warehouse' }
export function guardProcurementSubroute(path: string): true | string {
  if (!path.startsWith('/procurement')) return true
  if (!canCurrentRoleAccessProcurement()) return '/dashboard?denied=procurement'
  return true
}
