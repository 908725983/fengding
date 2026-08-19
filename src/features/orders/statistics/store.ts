import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { createOrderMockSession, type OrderScenarioName } from '../../../../mock/handlers/order-handler'
import { setCurrentOrderRole } from '../runtime/order-access'
import { InMemoryStatisticsPreferenceRepository } from './preference-repository'
import { createOrderStatisticsService } from './service'
import type {
  OrderStatisticsActor, OrderStatisticsFilterOptions, OrderStatisticsPage, OrderStatisticsQuery, OrderStatisticsReportKey,
  StatisticsPivotConfig,
} from './types'

const prototypeNow = '2026-08-10T10:00:00+08:00'
const emptyPage = (report: OrderStatisticsReportKey): OrderStatisticsPage => ({
  report, availability: 'available', message: null,
  query: { report, documentKind: 'order', unitMode: 'base', fromDate: '2026-05-10', toDate: '2026-08-10', page: 1, pageSize: 30 },
  items: [], total: 0, totals: { documentCount: 0, baseQuantityMilli: 0, amountCents: 0, amountState: 'available' }, snapshotVersion: 'unloaded',
})

const defaultPivot = (report: StatisticsPivotConfig['report']): StatisticsPivotConfig => report === 'order-by-customer'
  ? { report, dimensions: ['customer', 'product', 'unit'], measures: ['document-count', 'quantity', 'amount', 'average-price'] }
  : { report, dimensions: ['product', 'unit'], measures: ['document-count', 'quantity', 'amount', 'average-price', 'fulfillment-rate', 'discount-rate'] }

export const useOrderStatisticsStore = defineStore('order-statistics', () => {
  const scenario = ref<OrderScenarioName>('normal')
  const actor = ref<OrderStatisticsActor>({ role: 'super-admin', actorId: 'admin-demo' })
  const page = ref<OrderStatisticsPage>(emptyPage('order-line-detail'))
  const options = ref<OrderStatisticsFilterOptions>({ customers: [], products: [] })
  const loading = ref(false); const exporting = ref(false); const error = ref<string | null>(null)
  const preferences = new InMemoryStatisticsPreferenceRepository()
  const preferenceVersion = ref(0)
  let session = createOrderMockSession('normal', true)
  let service = createOrderStatisticsService({ repository: session.repository, now: () => prototypeNow })
  let requestVersion = 0

  const access = computed(() => service.getAccess(actor.value, page.value.report))
  const isEmpty = computed(() => !loading.value && !error.value && page.value.availability === 'available' && page.value.total === 0)

  async function load(input: OrderStatisticsQuery): Promise<void> {
    const version = ++requestVersion; loading.value = true; error.value = null
    try {
      const response = await session.run(() => service.query(actor.value, input))
      const nextOptions = await session.run(() => service.listFilterOptions(actor.value, input.report))
      if (version === requestVersion) { page.value = response; options.value = nextOptions }
    } catch (caught) {
      if (version === requestVersion) { error.value = caught instanceof Error ? caught.message : '统计数据加载失败'; page.value = emptyPage(input.report); options.value = { customers: [], products: [] } }
    } finally { if (version === requestVersion) loading.value = false }
  }

  async function setScenario(next: OrderScenarioName, input: OrderStatisticsQuery): Promise<void> {
    scenario.value = next; actor.value = { role: 'super-admin', actorId: 'admin-demo' }; setCurrentOrderRole(actor.value.role)
    session = createOrderMockSession(next, true); service = createOrderStatisticsService({ repository: session.repository, now: () => prototypeNow }); preferences.resetAll()
    await load(input)
  }

  async function setRole(role: OrderStatisticsActor['role'], input: OrderStatisticsQuery): Promise<void> {
    actor.value = { role, actorId: role === 'salesperson' ? 'staff-demo-1' : `${role}-demo` }; setCurrentOrderRole(role)
    await load(input)
  }

  function pivot(report: StatisticsPivotConfig['report']): StatisticsPivotConfig {
    preferenceVersion.value
    return preferences.get(actor.value.actorId, report) ?? defaultPivot(report)
  }
  function savePivot(config: StatisticsPivotConfig): StatisticsPivotConfig {
    // The view passes a Vue reactive draft; persist a plain snapshot at the repository boundary.
    const snapshot: StatisticsPivotConfig = {
      report: config.report,
      dimensions: [...config.dimensions],
      measures: [...config.measures],
    }
    const saved = preferences.save(actor.value.actorId, snapshot)
    preferenceVersion.value += 1
    return saved
  }
  function resetPivot(report: StatisticsPivotConfig['report']): StatisticsPivotConfig {
    preferences.reset(actor.value.actorId, report); preferenceVersion.value += 1; return defaultPivot(report)
  }

  async function exportCsv(input: OrderStatisticsQuery): Promise<string | null> {
    exporting.value = true; error.value = null
    try { return await session.run(() => service.exportCsv(actor.value, input)) }
    catch (caught) { error.value = caught instanceof Error ? caught.message : '统计导出失败'; return null }
    finally { exporting.value = false }
  }

  return { scenario, actor, page, options, loading, exporting, error, access, isEmpty, load, setScenario, setRole, pivot, savePivot, resetPivot, exportCsv }
})
