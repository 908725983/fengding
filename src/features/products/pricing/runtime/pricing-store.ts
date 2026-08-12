import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { createPricingMockSession, type PricingScenarioName } from '../../../../../mock/handlers/pricing-handler'
import { setCurrentProductRole } from '../../runtime/product-access'
import type {
  AdjustmentType,
  ApplyAdjustmentFormulaInput,
  AutoPriceStrategy,
  PriceAdjustment,
  PriceAdjustmentDraft,
  PriceAdjustmentPage,
  PriceAdjustmentQuery,
  PriceHistoryPage,
  PriceHistoryQuery,
  PricingActor,
  PricingFormOptions,
  PricingMatrixRow,
  PricingSkuSnapshot,
  PricingUnitPriceRow,
  PricingWorkspace,
  PriceValues,
  UnitPriceOverride,
} from '../types'
import type { SaveStrategyInput } from '../services/pricing-service'

export type PricingRuntimeScenario = PricingScenarioName | 'partial-failure' | 'boundary'
export type PricingRuntimeView = AdjustmentType | 'history' | 'unit-prices' | 'strategies'

const emptyAdjustments = (): PriceAdjustmentPage => ({ items: [], total: 0, page: 1, pageSize: 30 })
const emptyHistory = (): PriceHistoryPage => ({ items: [], total: 0, page: 1, pageSize: 30 })

export const usePricingStore = defineStore('product-pricing', () => {
  const scenario = ref<PricingRuntimeScenario>('normal')
  const actor = ref<PricingActor>({ role: 'super-admin', actorId: 'admin-demo' })
  const activeView = ref<PricingRuntimeView>('level')
  const adjustmentQuery = ref<PriceAdjustmentQuery>({ type: 'level', page: 1, pageSize: 30 })
  const historyQuery = ref<PriceHistoryQuery>({ page: 1, pageSize: 30 })
  const adjustments = ref<PriceAdjustmentPage>(emptyAdjustments())
  const history = ref<PriceHistoryPage>(emptyHistory())
  const selectedAdjustment = ref<PriceAdjustment | null>(null)
  const formOptions = ref<PricingFormOptions>({ clock: '', skus: [], customers: [], matrices: {} })
  const draftMatrix = ref<PricingMatrixRow[]>([])
  const unitPrices = ref<PricingUnitPriceRow[]>([])
  const strategies = ref<AutoPriceStrategy[]>([])
  const customerNames = ref<Record<string, string>>({})
  const skuSnapshots = ref<Record<string, PricingSkuSnapshot>>({})
  const clock = ref('')
  const loading = ref(false)
  const saving = ref(false)
  const error = ref<string | null>(null)
  const referenceError = ref<string | null>(null)
  let session = createPricingMockSession('normal')

  const canWrite = computed(() => actor.value.role === 'super-admin')
  const isEmpty = computed(() => !loading.value && !error.value && (activeView.value === 'history' ? history.value.total === 0
    : activeView.value === 'unit-prices' ? unitPrices.value.length === 0 : activeView.value === 'strategies' ? strategies.value.length === 0 : adjustments.value.total === 0))

  function collectReferences(): void {
    customerNames.value = {}
    skuSnapshots.value = {}
    if (scenario.value === 'partial-failure') {
      referenceError.value = '原型模拟：客户资料加载失败，调价单和商品资料仍可使用'
    } else {
      for (const item of adjustments.value.items) {
        if (!item.customerId) continue
        const customer = session.catalog.getCustomer(item.customerId)
        if (customer) customerNames.value[item.customerId] = customer.customerName
      }
    }
    for (const item of history.value.items) {
      const sku = session.catalog.getSku(item.skuId)
      if (sku) skuSnapshots.value[item.skuId] = sku
    }
  }

  async function loadAdjustments(type: AdjustmentType = adjustmentQuery.value.type): Promise<void> {
    activeView.value = type
    adjustmentQuery.value = { ...adjustmentQuery.value, type }
    loading.value = true; error.value = null; referenceError.value = null
    try {
      const response = await session.run(() => ({ page: session.service.listAdjustments(actor.value, adjustmentQuery.value), clock: session.service.getClock(actor.value) }))
      adjustments.value = response.page; clock.value = response.clock; collectReferences()
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : '调价单加载失败'; adjustments.value = emptyAdjustments()
    } finally { loading.value = false }
  }

  async function loadHistory(): Promise<void> {
    activeView.value = 'history'; loading.value = true; error.value = null; referenceError.value = null
    try {
      const response = await session.run(() => ({ page: session.service.listHistory(actor.value, historyQuery.value), clock: session.service.getClock(actor.value) }))
      history.value = response.page; clock.value = response.clock; collectReferences()
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : '历史调价加载失败'; history.value = emptyHistory()
    } finally { loading.value = false }
  }

  async function reload(): Promise<void> {
    if (activeView.value === 'history') await loadHistory()
    else if (activeView.value === 'unit-prices' || activeView.value === 'strategies') await loadWorkspace(activeView.value)
    else await loadAdjustments(activeView.value)
  }

  async function loadWorkspace(view: 'unit-prices' | 'strategies'): Promise<void> {
    activeView.value = view; loading.value = true; error.value = null; referenceError.value = null
    try {
      const workspace: PricingWorkspace = await session.run(() => session.service.getPricingWorkspace(actor.value))
      unitPrices.value = workspace.unitPrices; strategies.value = workspace.strategies; clock.value = workspace.clock
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : '价格工作台加载失败'; unitPrices.value = []; strategies.value = []
    } finally { loading.value = false }
  }

  async function loadAdjustment(id: string): Promise<void> {
    loading.value = true; error.value = null
    try {
      selectedAdjustment.value = await session.run(() => session.service.getAdjustment(actor.value, id))
      if (selectedAdjustment.value.customerId) {
        const customer = session.catalog.getCustomer(selectedAdjustment.value.customerId)
        if (customer) customerNames.value[customer.customerId] = customer.customerName
      }
    }
    catch (caught) { error.value = caught instanceof Error ? caught.message : '调价单详情加载失败'; selectedAdjustment.value = null }
    finally { loading.value = false }
  }

  async function loadFormOptions(): Promise<void> {
    loading.value = true; error.value = null; referenceError.value = null
    try {
      formOptions.value = await session.run(() => session.service.getFormOptions(actor.value))
      clock.value = formOptions.value.clock
      if (scenario.value === 'partial-failure') { formOptions.value = { ...formOptions.value, customers: [] }; referenceError.value = '原型模拟：客户资料加载失败，非客户调价仍可继续' }
    } catch (caught) { error.value = caught instanceof Error ? caught.message : '价格表单资料加载失败' }
    finally { loading.value = false }
  }

  async function previewDraft(draft: PriceAdjustmentDraft): Promise<PricingMatrixRow[]> {
    draftMatrix.value = await session.run(() => session.service.getDraftMatrix(actor.value, JSON.parse(JSON.stringify(draft)) as PriceAdjustmentDraft))
    return draftMatrix.value
  }

  async function calculateDraft(input: ApplyAdjustmentFormulaInput): Promise<PriceAdjustmentDraft> {
    return session.run(() => session.service.applyAdjustmentFormula(actor.value, JSON.parse(JSON.stringify(input)) as ApplyAdjustmentFormulaInput))
  }

  async function createAdjustment(draft: PriceAdjustmentDraft): Promise<PriceAdjustment> {
    saving.value = true
    try { const item = await session.run(() => session.service.createAdjustment(actor.value, JSON.parse(JSON.stringify(draft)) as PriceAdjustmentDraft)); selectedAdjustment.value = item; return item }
    finally { saving.value = false }
  }

  async function updateAdjustment(id: string, draft: PriceAdjustmentDraft): Promise<PriceAdjustment> {
    saving.value = true
    try { const item = await session.run(() => session.service.updateAdjustment(actor.value, id, JSON.parse(JSON.stringify(draft)) as PriceAdjustmentDraft)); selectedAdjustment.value = item; return item }
    finally { saving.value = false }
  }

  async function deleteAdjustment(id: string): Promise<void> {
    saving.value = true
    try { await session.run(() => session.service.deleteAdjustment(actor.value, id)); selectedAdjustment.value = null }
    finally { saving.value = false }
  }

  async function saveUnitOverride(skuId: string, unitId: string, prices: Partial<PriceValues>): Promise<UnitPriceOverride> {
    saving.value = true
    try { const item = await session.run(() => session.service.saveUnitOverride(actor.value, skuId, unitId, structuredClone(prices))); await loadWorkspace('unit-prices'); return item }
    finally { saving.value = false }
  }

  async function saveStrategy(input: SaveStrategyInput): Promise<AutoPriceStrategy> {
    saving.value = true
    try { const item = await session.run(() => session.service.saveStrategy(actor.value, structuredClone(input))); await loadWorkspace('strategies'); return item }
    finally { saving.value = false }
  }

  async function advanceClock(target: string): Promise<void> {
    saving.value = true
    try { await session.run(() => session.service.advanceClock(actor.value, target)); clock.value = session.service.getClock(actor.value); await reload() }
    finally { saving.value = false }
  }

  async function setScenario(next: PricingRuntimeScenario): Promise<void> {
    scenario.value = next
    actor.value = next === 'permission-denied' ? { role: 'finance', actorId: 'finance-demo' } : { role: 'super-admin', actorId: 'admin-demo' }
    setCurrentProductRole(actor.value.role)
    const baseScenario: PricingScenarioName = next === 'partial-failure' || next === 'boundary' ? 'normal' : next
    session = createPricingMockSession(baseScenario)
    if (next === 'boundary') session.service.advanceClock(actor.value, '2026-08-10T10:00:00+08:00')
    await reload()
  }

  async function applyAdjustmentQuery(next: PriceAdjustmentQuery): Promise<void> {
    adjustmentQuery.value = { ...next, page: 1, pageSize: next.pageSize ?? 30 }
    await loadAdjustments(next.type)
  }

  async function applyHistoryQuery(next: PriceHistoryQuery): Promise<void> {
    historyQuery.value = { ...next, page: 1, pageSize: next.pageSize ?? 30 }
    await loadHistory()
  }

  async function setPage(page: number): Promise<void> {
    if (activeView.value === 'history') { historyQuery.value = { ...historyQuery.value, page: Math.max(1, page) }; await loadHistory() }
    else if (activeView.value === 'unit-prices' || activeView.value === 'strategies') await loadWorkspace(activeView.value)
    else { adjustmentQuery.value = { ...adjustmentQuery.value, page: Math.max(1, page) }; await loadAdjustments(activeView.value) }
  }

  function customerName(id: string | null): string { return id ? customerNames.value[id] ?? (referenceError.value ? '客户资料不可用' : id) : '—' }
  function skuSnapshot(id: string): PricingSkuSnapshot | null { return skuSnapshots.value[id] ?? null }

  return {
    scenario, actor, activeView, adjustmentQuery, historyQuery, adjustments, history, selectedAdjustment, formOptions, draftMatrix, unitPrices, strategies,
    clock, loading, saving, error, referenceError, canWrite, isEmpty,
    loadAdjustments, loadHistory, loadWorkspace, loadAdjustment, loadFormOptions, previewDraft, calculateDraft, createAdjustment, updateAdjustment, deleteAdjustment,
    saveUnitOverride, saveStrategy, advanceClock, reload, setScenario, applyAdjustmentQuery, applyHistoryQuery, setPage, customerName, skuSnapshot,
  }
})
