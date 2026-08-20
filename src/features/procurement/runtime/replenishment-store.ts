import { defineStore } from 'pinia'
import { ref } from 'vue'
import { createProcurementMockSession, type ProcurementScenarioName } from '../../../../mock/handlers/procurement-handler'
import { setCurrentProcurementRole } from './procurement-access'
import type { ProcurementActor, ReplenishmentMode, ReplenishmentQuery, ReplenishmentResult, ReplenishmentRow } from '../types'

const emptyResult = (): ReplenishmentResult => ({ rows: [], summary: { inventoryTotal: null, shortageTotal: null, suggestedTotal: null }, availability: 'unavailable', version: 'empty' })

export const useReplenishmentStore = defineStore('procurement-replenishment', () => {
  const scenario = ref<ProcurementScenarioName>('normal')
  const actor = ref<ProcurementActor>({ role: 'super-admin', actorId: 'admin-demo' })
  const mode = ref<ReplenishmentMode>('combined')
  const result = ref<ReplenishmentResult>(emptyResult())
  const loading = ref(false); const error = ref<string | null>(null); const saving = ref(false)
  let session = createProcurementMockSession('normal'); let requestToken = 0; let sequence = 1
  const canWrite = () => actor.value.role === 'super-admin' || actor.value.role === 'warehouse'
  async function load(query: Omit<ReplenishmentQuery, 'mode'> = {}): Promise<void> {
    const token = ++requestToken; loading.value = true; error.value = null
    try { const next = await session.run(() => session.replenishment.analyze(actor.value, { ...query, mode: mode.value })); if (token === requestToken) result.value = next }
    catch (caught) { if (token === requestToken) { error.value = caught instanceof Error ? caught.message : '补货分析加载失败'; result.value = emptyResult() } }
    finally { if (token === requestToken) loading.value = false }
  }
  async function setMode(next: ReplenishmentMode): Promise<void> { mode.value = next; await load() }
  async function setScenario(next: ProcurementScenarioName): Promise<void> { scenario.value = next; actor.value = next === 'permission-denied' ? { role: 'finance', actorId: 'finance-demo' } : { role: 'super-admin', actorId: 'admin-demo' }; setCurrentProcurementRole(actor.value.role); session = createProcurementMockSession(next); await load() }
  async function setRole(role: ProcurementActor['role']): Promise<void> { actor.value = { role, actorId: `${role}-demo` }; setCurrentProcurementRole(role); await load() }
  function adjust(row: ReplenishmentRow, quantity: number): void { saving.value = true; try { const updated = session.replenishment.applyManualQuantity(actor.value, row, quantity); result.value = { ...result.value, rows: result.value.rows.map((item) => item.id === row.id ? updated : item) } } finally { saving.value = false } }
  function exportCsv(): string { return session.replenishment.exportCsv(result.value) }
  function createDraft(selected: ReplenishmentRow[]) { return session.replenishment.createStockDraft(actor.value, result.value.rows, selected.map((row) => ({ row }))) }
  return { scenario, actor, mode, result, loading, error, saving, canWrite, load, setMode, setScenario, setRole, adjust, exportCsv, createDraft }
})
