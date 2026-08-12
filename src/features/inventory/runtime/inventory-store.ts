import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { createInventoryMockSession, type InventoryScenarioName } from '../../../../mock/handlers/inventory-handler'
import { setCurrentInventoryRole } from './inventory-access'
import type { InventoryActor, InventoryQuery, InventoryThreshold, InventoryWorkspace, LocationDraft, LocationImportRow, WarehouseDraft } from '../types'

const emptyWorkspace = (): InventoryWorkspace => ({ stocks: { items: [], total: 0, page: 1, pageSize: 30 }, batches: [], movements: [], warehouses: [], locations: [], catalogAvailable: true })

export const useInventoryStore = defineStore('inventory', () => {
  const scenario = ref<InventoryScenarioName>('normal'); const actor = ref<InventoryActor>({ role: 'super-admin', actorId: 'admin-demo' })
  const query = ref<InventoryQuery>({ page: 1, pageSize: 30 }); const workspace = ref<InventoryWorkspace>(emptyWorkspace())
  const loading = ref(false); const saving = ref(false); const error = ref<string | null>(null); let session = createInventoryMockSession('normal')
  const canWrite = computed(() => ['super-admin', 'warehouse'].includes(actor.value.role)); const isEmpty = computed(() => !loading.value && !error.value && workspace.value.stocks.total === 0)
  async function load(): Promise<void> { loading.value = true; error.value = null; try { workspace.value = await session.run(() => session.service.getWorkspace(actor.value, query.value)) } catch (caught) { error.value = caught instanceof Error ? caught.message : '库存数据加载失败'; workspace.value = emptyWorkspace() } finally { loading.value = false } }
  async function setScenario(next: InventoryScenarioName): Promise<void> { scenario.value = next; actor.value = next === 'permission-denied' ? { role: 'finance', actorId: 'finance-demo' } : { role: 'super-admin', actorId: 'admin-demo' }; setCurrentInventoryRole(actor.value.role); session = createInventoryMockSession(next); await load() }
  async function setRole(role: InventoryActor['role']): Promise<void> { actor.value = { role, actorId: `${role}-demo` }; setCurrentInventoryRole(role); await load() }
  async function applyQuery(next: InventoryQuery): Promise<void> { query.value = { ...next, page: next.page ?? 1, pageSize: 30 }; await load() }
  async function saveWarehouse(draft: WarehouseDraft, id?: string): Promise<void> { saving.value = true; try { await session.run(() => session.service.saveWarehouse(actor.value, draft, id)); await load() } finally { saving.value = false } }
  async function saveLocation(draft: LocationDraft, id?: string): Promise<void> { saving.value = true; try { await session.run(() => session.service.saveLocation(actor.value, draft, id)); await load() } finally { saving.value = false } }
  async function saveThreshold(value: InventoryThreshold): Promise<void> { saving.value = true; try { await session.run(() => session.service.saveThreshold(actor.value, value)); await load() } finally { saving.value = false } }
  async function importLocations(rows: LocationImportRow[]): Promise<void> { saving.value = true; try { await session.run(() => session.service.importLocations(actor.value, rows)); await load() } finally { saving.value = false } }
  function previewLocationImport(rows: LocationImportRow[]) { return session.service.previewLocationImport(actor.value, rows) }
  function exportStocks(selected: string[]): string { return session.service.exportStocksCsv(actor.value, query.value, selected) }
  function exportLocations(selected: string[]): string { return session.service.exportLocationsCsv(actor.value, selected) }
  return { scenario, actor, query, workspace, loading, saving, error, canWrite, isEmpty, load, setScenario, setRole, applyQuery, saveWarehouse, saveLocation, saveThreshold, importLocations, previewLocationImport, exportStocks, exportLocations }
})
