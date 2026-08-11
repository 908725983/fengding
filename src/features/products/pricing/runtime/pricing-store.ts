import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { createPricingMockSession, type PricingScenarioName } from '../../../../../mock/handlers/pricing-handler'
import { setCurrentProductRole } from '../../runtime/product-access'
import type {
  AdjustmentType,
  PriceAdjustmentPage,
  PriceAdjustmentQuery,
  PriceHistoryPage,
  PriceHistoryQuery,
  PricingActor,
  PricingSkuSnapshot,
} from '../types'

export type PricingRuntimeScenario = PricingScenarioName | 'partial-failure' | 'boundary'
export type PricingRuntimeView = AdjustmentType | 'history'

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
  const customerNames = ref<Record<string, string>>({})
  const skuSnapshots = ref<Record<string, PricingSkuSnapshot>>({})
  const clock = ref('')
  const loading = ref(false)
  const error = ref<string | null>(null)
  const referenceError = ref<string | null>(null)
  let session = createPricingMockSession('normal')

  const canWrite = computed(() => actor.value.role === 'super-admin')
  const isEmpty = computed(() => !loading.value && !error.value && (activeView.value === 'history' ? history.value.total === 0 : adjustments.value.total === 0))

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

  async function reload(): Promise<void> { if (activeView.value === 'history') await loadHistory(); else await loadAdjustments(activeView.value) }

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
    else { adjustmentQuery.value = { ...adjustmentQuery.value, page: Math.max(1, page) }; await loadAdjustments(activeView.value) }
  }

  function customerName(id: string | null): string { return id ? customerNames.value[id] ?? (referenceError.value ? '客户资料不可用' : id) : '—' }
  function skuSnapshot(id: string): PricingSkuSnapshot | null { return skuSnapshots.value[id] ?? null }

  return {
    scenario, actor, activeView, adjustmentQuery, historyQuery, adjustments, history, clock, loading, error, referenceError,
    canWrite, isEmpty, loadAdjustments, loadHistory, reload, setScenario, applyAdjustmentQuery, applyHistoryQuery, setPage, customerName, skuSnapshot,
  }
})
