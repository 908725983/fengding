import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { getApplicationMockRuntimeController } from '@/app/runtime/app-mock-runtime'
import { setCurrentSettingsRole } from './settings-access'
import type { Announcement, AnnouncementDraft, CompanyDraft, Department, DepartmentDraft, Region, RegionDraft, SettingsActor, SettingsEmployee, SettingsEmployeeDraft, SettingsRole, SettingsRoleDraft, SettingsRoleRecord, SettingsAuditLog } from '../types'
import type { SettingsScenarioName } from '../../../../mock/handlers/settings-handler'

export const useSettingsStore = defineStore('settings', () => {
  const controller = getApplicationMockRuntimeController(); const session = controller.settings
  const actor = ref<SettingsActor>({ role: 'super-admin', actorId: 'admin-demo' }); const scenario = computed<SettingsScenarioName>(() => session.scenarioName)
  const company = ref<any>(null); const departments = ref<Department[]>([]); const announcements = ref<Announcement[]>([]); const regions = ref<Region[]>([]); const warehouses = ref<any[]>([]); const roles = ref<SettingsRoleRecord[]>([]); const employees = ref<SettingsEmployee[]>([]); const auditLogs = ref<SettingsAuditLog[]>([]); const loading = ref(false); const saving = ref(false); const error = ref<string | null>(null)
  const canWrite = computed(() => actor.value.role === 'super-admin'); const isEmpty = computed(() => !loading.value && !error.value && !departments.value.length && !announcements.value.length)
  async function load() { loading.value = true; error.value = null; try { company.value = await session.run(() => session.repository.read().company); departments.value = await session.run(() => session.service.listDepartments()); announcements.value = await session.run(() => session.service.listAnnouncements()); regions.value = await session.run(() => session.service.listRegions()); warehouses.value = await session.run(() => session.service.listWarehouses(actor.value)); roles.value = actor.value.role === 'super-admin' ? await session.run(() => session.service.listRoles(actor.value)) : []; employees.value = actor.value.role === 'super-admin' ? await session.run(() => session.service.listEmployees(actor.value)) : []; auditLogs.value = ['super-admin', 'finance', 'warehouse', 'sales-supervisor'].includes(actor.value.role) ? await session.run(() => session.service.listAuditLogs(actor.value)) : [] } catch (e) { error.value = e instanceof Error ? e.message : '设置数据加载失败'; company.value = null; departments.value = []; announcements.value = []; regions.value = []; warehouses.value = []; roles.value = []; employees.value = []; auditLogs.value = [] } finally { loading.value = false } }
  async function setScenario(value: SettingsScenarioName) { actor.value = value === 'permission-denied' ? { role: 'finance', actorId: 'finance-demo' } : { role: 'super-admin', actorId: 'admin-demo' }; setCurrentSettingsRole(actor.value.role); controller.reset(value); await load() }
  async function setRole(role: SettingsRole) { actor.value = { role, actorId: `${role}-demo` }; setCurrentSettingsRole(role); await load() }
  async function mutate<T>(operation: () => Promise<T>) { saving.value = true; error.value = null; try { return await operation() } catch (e) { error.value = e instanceof Error ? e.message : '保存失败'; throw e } finally { saving.value = false } }
  const saveCompany = (draft: CompanyDraft) => mutate(async () => { await session.run(() => session.service.saveCompany(actor.value, draft)); await load() })
  const saveDepartment = (draft: DepartmentDraft, id?: string) => mutate(async () => { await session.run(() => session.service.saveDepartment(actor.value, draft, id)); await load() })
  const deleteDepartment = (id: string) => mutate(async () => { await session.run(() => session.service.deleteDepartment(actor.value, id)); await load() })
  const saveAnnouncement = (draft: AnnouncementDraft, id?: string) => mutate(async () => { await session.run(() => session.service.saveAnnouncement(actor.value, draft, id)); await load() })
  const publishAnnouncement = (id: string) => mutate(async () => { await session.run(() => session.service.publishAnnouncement(actor.value, id)); await load() })
  const retryAnnouncementPush = (id: string) => mutate(async () => { await session.run(() => session.service.retryAnnouncementPush(actor.value, id)); await load() })
  const saveRegion = (draft: RegionDraft, id?: string) => mutate(async () => { await session.run(() => session.service.saveRegion(actor.value, draft, id)); await load() })
  const deleteRegion = (id: string) => mutate(async () => { await session.run(() => session.service.deleteRegion(actor.value, id)); await load() })
  const saveWarehouse = (draft: any, id?: string) => mutate(async () => { await session.run(() => session.service.saveWarehouse(actor.value, draft, id)); await load() })
  const saveRole = (draft: SettingsRoleDraft, id?: string) => mutate(async () => { await session.run(() => session.service.saveRole(actor.value, draft, id)); await load() })
  const disableRole = (id: string) => mutate(async () => { await session.run(() => session.service.disableRole(actor.value, id)); await load() })
  const saveEmployee = (draft: SettingsEmployeeDraft, id?: string) => mutate(async () => { await session.run(() => session.service.saveEmployee(actor.value, draft, id)); await load() })
  const disableEmployee = (id: string) => mutate(async () => { await session.run(() => session.service.disableEmployee(actor.value, id)); await load() })
  const resetEmployeePassword = (id: string) => mutate(async () => { await session.run(() => session.service.resetEmployeePassword(actor.value, id)); await load() })
  const exportAuditCsv = (query: { keyword?: string; from?: string; to?: string } = {}) => session.service.exportAuditCsv(actor.value, query)
  const queryAuditLogs = async (query: { keyword?: string; from?: string; to?: string } = {}) => { auditLogs.value = await session.run(() => session.service.listAuditLogs(actor.value, query)); return auditLogs.value }
  const permissionCatalog = computed(() => session.service.listPermissionCatalog())
  return { actor, scenario, company, departments, announcements, regions, warehouses, roles, employees, auditLogs, permissionCatalog, loading, saving, error, canWrite, isEmpty, load, setScenario, setRole, saveCompany, saveDepartment, deleteDepartment, saveAnnouncement, publishAnnouncement, retryAnnouncementPush, saveRegion, deleteRegion, saveWarehouse, saveRole, disableRole, saveEmployee, disableEmployee, resetEmployeePassword, exportAuditCsv, queryAuditLogs }
})
