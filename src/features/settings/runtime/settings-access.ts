import { computed, ref } from 'vue'
export const currentSettingsRole = ref<'super-admin' | 'sales-supervisor' | 'salesperson' | 'warehouse' | 'finance'>('super-admin')
export function setCurrentSettingsRole(role: typeof currentSettingsRole.value) { currentSettingsRole.value = role }
export const canAccessSettings = computed(() => currentSettingsRole.value === 'super-admin')
export function guardSettingsSubroute(path: string): true | string { if (!path.startsWith('/settings')) return true; const readOnlyLog = path.startsWith('/settings/logs') && ['finance', 'warehouse', 'sales-supervisor'].includes(currentSettingsRole.value); return currentSettingsRole.value === 'super-admin' || readOnlyLog ? true : '/dashboard?denied=1' }
