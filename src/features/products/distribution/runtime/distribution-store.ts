import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { createDistributionMockSession, type DistributionScenarioName } from '../../../../../mock/handlers/distribution-handler'
import { setCurrentProductRole } from '../../runtime/product-access'
import type {
  DistributionActor, DistributionPage, DistributionPlan, DistributionPlanDraft, DistributionPlanListItem, DistributionPlanQuery,
  DistributionStatisticsResult, DistributionStatus, DistributionWorkspaceOptions, OrderChannel, OrderTemplate, OrderTemplateDraft,
  OrderTemplateListItem, OrderTemplateQuery, SuggestionResult,
} from '../types'

export type DistributionRuntimeScenario = DistributionScenarioName | 'partial-failure' | 'boundary'
export type DistributionView = 'plans' | 'templates' | 'preview' | 'statistics'
const emptyPage = <T>(): DistributionPage<T> => ({ items: [], total: 0, page: 1, pageSize: 30 })
const emptyOptions = (): DistributionWorkspaceOptions => ({ clock: '', customers: [], customerCategories: [], customerTags: [], skus: [] })

export const useDistributionStore = defineStore('product-distribution', () => {
  const scenario = ref<DistributionRuntimeScenario>('normal')
  const actor = ref<DistributionActor>({ role: 'super-admin', actorId: 'admin-demo' })
  const activeView = ref<DistributionView>('plans')
  const planQuery = ref<DistributionPlanQuery>({ page: 1, pageSize: 30 })
  const templateQuery = ref<OrderTemplateQuery>({ page: 1, pageSize: 30 })
  const plans = ref<DistributionPage<DistributionPlanListItem>>(emptyPage())
  const templates = ref<DistributionPage<OrderTemplateListItem>>(emptyPage())
  const options = ref<DistributionWorkspaceOptions>(emptyOptions())
  const selectedPlan = ref<DistributionPlan | null>(null)
  const selectedTemplate = ref<OrderTemplate | null>(null)
  const preview = ref<SuggestionResult | null>(null)
  const statistics = ref<DistributionStatisticsResult | null>(null)
  const loading = ref(false); const saving = ref(false); const error = ref<string | null>(null); const referenceError = ref<string | null>(null)
  let session = createDistributionMockSession('normal')

  const canWrite = computed(() => actor.value.role === 'super-admin')
  const isEmpty = computed(() => !loading.value && !error.value && (activeView.value === 'plans' ? plans.value.total === 0 : activeView.value === 'templates' ? templates.value.total === 0 : false))

  async function loadOptions(): Promise<void> {
    const loaded = await session.run(() => session.service.getWorkspaceOptions(actor.value)); options.value = loaded
    if (scenario.value === 'partial-failure') {
      options.value = { ...loaded, customers: [] }
      referenceError.value = '原型模拟：客户资料加载失败；保留既有范围引用，并禁止以空资料保存覆盖'
    }
  }

  async function load(view: DistributionView = activeView.value): Promise<void> {
    activeView.value = view; loading.value = true; error.value = null; referenceError.value = null
    try {
      await loadOptions()
      if (view === 'plans') plans.value = await session.run(() => session.service.listPlans(actor.value, planQuery.value))
      else if (view === 'templates') templates.value = await session.run(() => session.service.listTemplates(actor.value, templateQuery.value))
      else if (view === 'preview') {
        const response = await session.run(() => ({ plans: session.service.listPlans(actor.value, { page: 1, pageSize: 100 }), templates: session.service.listTemplates(actor.value, { page: 1, pageSize: 100 }) }))
        plans.value = response.plans; templates.value = response.templates
      } else statistics.value = await session.run(() => session.service.getStatistics(actor.value))
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : '铺货与订单模板数据加载失败'
      if (view === 'plans') plans.value = emptyPage(); else if (view === 'templates') templates.value = emptyPage()
    } finally { loading.value = false }
  }

  async function setScenario(next: DistributionRuntimeScenario): Promise<void> {
    scenario.value = next
    actor.value = next === 'permission-denied' ? { role: 'finance', actorId: 'finance-demo' } : { role: 'super-admin', actorId: 'admin-demo' }
    setCurrentProductRole(actor.value.role)
    session = createDistributionMockSession(next === 'partial-failure' || next === 'boundary' ? 'normal' : next)
    if (next === 'boundary') session.setClock('2026-08-10T10:00:00+08:00')
    preview.value = null; statistics.value = null
    await load()
  }

  async function applyPlanQuery(query: DistributionPlanQuery) { planQuery.value = { ...query, page: 1, pageSize: query.pageSize ?? 30 }; await load('plans') }
  async function applyTemplateQuery(query: OrderTemplateQuery) { templateQuery.value = { ...query, page: 1, pageSize: query.pageSize ?? 30 }; await load('templates') }
  async function loadPlan(id: string) { loading.value = true; error.value = null; referenceError.value = null; try { await loadOptions(); selectedPlan.value = await session.run(() => session.service.getPlan(actor.value, id)) } catch (caught) { error.value = caught instanceof Error ? caught.message : '铺货方案加载失败'; selectedPlan.value = null } finally { loading.value = false } }
  async function loadTemplate(id: string) { loading.value = true; error.value = null; referenceError.value = null; try { await loadOptions(); selectedTemplate.value = await session.run(() => session.service.getTemplate(actor.value, id)) } catch (caught) { error.value = caught instanceof Error ? caught.message : '订单模板加载失败'; selectedTemplate.value = null } finally { loading.value = false } }
  async function savePlan(input: DistributionPlanDraft, id?: string): Promise<DistributionPlan> { saving.value = true; try { return await session.run(() => session.service.savePlan(actor.value, structuredClone(input), id)) } finally { saving.value = false } }
  async function saveTemplate(input: OrderTemplateDraft, id?: string): Promise<OrderTemplate> { saving.value = true; try { return await session.run(() => session.service.saveTemplate(actor.value, structuredClone(input), id)) } finally { saving.value = false } }
  async function changePlanStatus(id: string, status: DistributionStatus) { saving.value = true; try { await session.run(() => session.service.changePlanStatus(actor.value, id, status)); await load('plans') } finally { saving.value = false } }
  async function changeTemplateStatus(id: string, status: DistributionStatus) { saving.value = true; try { await session.run(() => session.service.changeTemplateStatus(actor.value, id, status)); await load('templates') } finally { saving.value = false } }
  async function resolveDistribution(customerId: string, channel: OrderChannel) { preview.value = await session.run(() => session.service.resolveDistribution(actor.value, customerId, channel)); return preview.value }
  async function resolveTemplate(templateId: string, customerId: string, channel: OrderChannel) { preview.value = await session.run(() => session.service.loadTemplate(actor.value, templateId, customerId, channel)); return preview.value }
  function exportStatistics(): never { return session.service.exportStatisticsCsv(actor.value) }

  return { scenario, actor, activeView, planQuery, templateQuery, plans, templates, options, selectedPlan, selectedTemplate, preview, statistics, loading, saving, error, referenceError, canWrite, isEmpty, load, setScenario, applyPlanQuery, applyTemplateQuery, loadPlan, loadTemplate, savePlan, saveTemplate, changePlanStatus, changeTemplateStatus, resolveDistribution, resolveTemplate, exportStatistics }
})
