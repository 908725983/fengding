import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { createAuthorizationMockSession, type AuthorizationScenarioName } from '../../../../../mock/handlers/authorization-handler'
import { setCurrentProductRole } from '../../runtime/product-access'
import type {
  AuthorizationActor, AuthorizationPage, AuthorizationPlan, AuthorizationPlanDraft, AuthorizationPlanListItem, AuthorizationPlanQuery,
  AuthorizationResolution, AuthorizationRule, AuthorizationRuleDraft, AuthorizationRuleListItem, AuthorizationRuleQuery,
  AuthorizationWorkspaceOptions, ProductAuthorizationDetail, SpecialAuthorization, SpecialAuthorizationBatchDraft,
  SpecialAuthorizationDraft, SpecialAuthorizationListItem, SpecialAuthorizationQuery,
} from '../types'

export type AuthorizationRuntimeScenario = AuthorizationScenarioName | 'partial-failure' | 'boundary'
export type AuthorizationView = 'plans' | 'rules' | 'specials'
const emptyPage = <T>(): AuthorizationPage<T> => ({ items: [], total: 0, page: 1, pageSize: 30 })
const emptyOptions = (): AuthorizationWorkspaceOptions => ({ products: [], categories: [], brands: [], customers: [], clock: '' })

export const useAuthorizationStore = defineStore('product-authorization', () => {
  const scenario = ref<AuthorizationRuntimeScenario>('normal')
  const actor = ref<AuthorizationActor>({ role: 'super-admin', actorId: 'admin-demo' })
  const activeView = ref<AuthorizationView>('plans')
  const planQuery = ref<AuthorizationPlanQuery>({ page: 1, pageSize: 30 })
  const ruleQuery = ref<AuthorizationRuleQuery>({ page: 1, pageSize: 30 })
  const specialQuery = ref<SpecialAuthorizationQuery>({ page: 1, pageSize: 30 })
  const plans = ref<AuthorizationPage<AuthorizationPlanListItem>>(emptyPage())
  const rules = ref<AuthorizationPage<AuthorizationRuleListItem>>(emptyPage())
  const specials = ref<AuthorizationPage<SpecialAuthorizationListItem>>(emptyPage())
  const options = ref<AuthorizationWorkspaceOptions>(emptyOptions())
  const selectedPlan = ref<AuthorizationPlan | null>(null)
  const selectedRule = ref<AuthorizationRule | null>(null)
  const productDetail = ref<ProductAuthorizationDetail | null>(null)
  const resolution = ref<AuthorizationResolution | null>(null)
  const loading = ref(false); const saving = ref(false); const error = ref<string | null>(null); const referenceError = ref<string | null>(null)
  let session = createAuthorizationMockSession('normal')
  const canWrite = computed(() => actor.value.role === 'super-admin')
  const isEmpty = computed(() => !loading.value && !error.value && (activeView.value === 'plans' ? plans.value.total === 0 : activeView.value === 'rules' ? rules.value.total === 0 : specials.value.total === 0))

  async function loadOptions(): Promise<void> {
    const loaded = await session.run(() => session.service.getWorkspaceOptions(actor.value)); options.value = loaded
    if (scenario.value === 'partial-failure') { options.value = { ...loaded, customers: [] }; referenceError.value = '原型模拟：客户资料加载失败，现有授权仍保留，禁止以空数据覆盖关联' }
  }
  async function load(view: AuthorizationView = activeView.value): Promise<void> {
    activeView.value = view; loading.value = true; error.value = null; referenceError.value = null
    try {
      await loadOptions()
      if (view === 'plans') plans.value = await session.run(() => session.service.listPlans(actor.value, planQuery.value))
      else if (view === 'rules') { const response = await session.run(() => ({ rules: session.service.listRules(actor.value, ruleQuery.value), plans: session.service.listPlans(actor.value, { page: 1, pageSize: 100 }) })); rules.value = response.rules; plans.value = response.plans }
      else specials.value = await session.run(() => session.service.listSpecials(actor.value, specialQuery.value))
    } catch (caught) { error.value = caught instanceof Error ? caught.message : '商品授权数据加载失败'; if (view === 'plans') plans.value = emptyPage(); else if (view === 'rules') rules.value = emptyPage(); else specials.value = emptyPage() }
    finally { loading.value = false }
  }
  async function setScenario(next: AuthorizationRuntimeScenario): Promise<void> {
    scenario.value = next; actor.value = next === 'permission-denied' ? { role: 'finance', actorId: 'finance-demo' } : { role: 'super-admin', actorId: 'admin-demo' }; setCurrentProductRole(actor.value.role)
    session = createAuthorizationMockSession(next === 'partial-failure' || next === 'boundary' ? 'normal' : next)
    if (next === 'boundary') session.setClock('2026-08-10T10:00:00+08:00')
    await load()
  }
  async function applyPlanQuery(query: AuthorizationPlanQuery) { planQuery.value = { ...query, page: 1, pageSize: query.pageSize ?? 30 }; await load('plans') }
  async function applyRuleQuery(query: AuthorizationRuleQuery) { ruleQuery.value = { ...query, page: 1, pageSize: query.pageSize ?? 30 }; await load('rules') }
  async function applySpecialQuery(query: SpecialAuthorizationQuery) { specialQuery.value = { ...query, page: 1, pageSize: query.pageSize ?? 30 }; await load('specials') }
  async function loadPlan(id: string) { loading.value = true; error.value = null; try { await loadOptions(); selectedPlan.value = await session.run(() => session.service.getPlan(actor.value, id)) } catch (caught) { error.value = caught instanceof Error ? caught.message : '授权方案加载失败'; selectedPlan.value = null } finally { loading.value = false } }
  async function loadRule(id: string) { loading.value = true; error.value = null; try { await loadOptions(); selectedRule.value = await session.run(() => session.service.getRule(actor.value, id)) } catch (caught) { error.value = caught instanceof Error ? caught.message : '授权规则加载失败'; selectedRule.value = null } finally { loading.value = false } }
  async function createPlan(input: AuthorizationPlanDraft): Promise<AuthorizationPlan> { saving.value = true; try { return await session.run(() => session.service.createPlan(actor.value, structuredClone(input))) } finally { saving.value = false } }
  async function updatePlan(id: string, input: AuthorizationPlanDraft): Promise<AuthorizationPlan> { saving.value = true; try { return await session.run(() => session.service.updatePlan(actor.value, id, structuredClone(input))) } finally { saving.value = false } }
  async function deletePlan(id: string) { saving.value = true; try { await session.run(() => session.service.deletePlan(actor.value, id)); await load('plans') } finally { saving.value = false } }
  async function createRule(input: AuthorizationRuleDraft): Promise<AuthorizationRule> { saving.value = true; try { return await session.run(() => session.service.createRule(actor.value, structuredClone(input))) } finally { saving.value = false } }
  async function updateRule(id: string, input: AuthorizationRuleDraft): Promise<AuthorizationRule> { saving.value = true; try { return await session.run(() => session.service.updateRule(actor.value, id, structuredClone(input))) } finally { saving.value = false } }
  async function deleteRule(id: string) { saving.value = true; try { await session.run(() => session.service.deleteRule(actor.value, id)); await load('rules') } finally { saving.value = false } }
  async function createSpecial(input: SpecialAuthorizationBatchDraft): Promise<SpecialAuthorization[]> { saving.value = true; try { const result = await session.run(() => session.service.createSpecialBatch(actor.value, structuredClone(input))); await load('specials'); return result } finally { saving.value = false } }
  async function updateSpecial(id: string, input: SpecialAuthorizationDraft): Promise<SpecialAuthorization> { saving.value = true; try { const result = await session.run(() => session.service.updateSpecial(actor.value, id, structuredClone(input))); await load('specials'); return result } finally { saving.value = false } }
  async function deleteSpecial(id: string) { saving.value = true; try { await session.run(() => session.service.deleteSpecial(actor.value, id)); await load('specials') } finally { saving.value = false } }
  async function loadProductDetail(productId: string) { loading.value = true; error.value = null; try { productDetail.value = await session.run(() => session.service.getProductAuthorizationDetail(actor.value, productId)) } catch (caught) { error.value = caught instanceof Error ? caught.message : '商品授权详情加载失败'; productDetail.value = null } finally { loading.value = false } }
  async function resolve(customerId: string, productId: string) { resolution.value = await session.run(() => session.service.resolveAuthorization(actor.value, customerId, productId)); return resolution.value }
  async function addProductToPlans(productId: string, planIds: string[]) { saving.value = true; try { await session.run(() => session.service.addProductToPlans(actor.value, productId, planIds)); await loadProductDetail(productId) } finally { saving.value = false } }
  function exportCsv(selectedIds: string[]): string { return session.service.exportPlansCsv(actor.value, selectedIds, planQuery.value) }
  async function importCsv(planId: string, csv: string) { saving.value = true; try { const preview = session.service.previewPlanProductsCsv(actor.value, planId, csv); if (!preview.errorCount) await session.run(() => session.service.importPlanProductsCsv(actor.value, planId, csv)); return preview } finally { saving.value = false } }
  return { scenario, actor, activeView, planQuery, ruleQuery, specialQuery, plans, rules, specials, options, selectedPlan, selectedRule, productDetail, resolution, loading, saving, error, referenceError, canWrite, isEmpty, load, setScenario, applyPlanQuery, applyRuleQuery, applySpecialQuery, loadPlan, loadRule, createPlan, updatePlan, deletePlan, createRule, updateRule, deleteRule, createSpecial, updateSpecial, deleteSpecial, loadProductDetail, resolve, addProductToPlans, exportCsv, importCsv }
})
