import { assertDistributionPlanDraft, assertOrderTemplateDraft } from '../schemas/distribution-schema'
import type { DistributionRepository } from '../repositories/distribution-repository'
import type {
  CustomerScope, DistributionActor, DistributionCatalogProvider, DistributionFeatureState, DistributionPage, DistributionPlan,
  DistributionPlanDraft, DistributionPlanListItem, DistributionPlanQuery, DistributionStatisticsResult, DistributionStatus,
  DistributionWorkspaceOptions, OrderChannel, OrderTemplate, OrderTemplateDraft, OrderTemplateListItem, OrderTemplateQuery,
  RejectedSuggestionLine, SuggestedOrderLine, SuggestionResult,
} from '../types'

export type DistributionDomainErrorCode = 'PERMISSION_DENIED' | 'NOT_FOUND' | 'DUPLICATE_NAME' | 'INVALID_TIME' | 'INACTIVE_REFERENCE' | 'DATA_PROVIDER_UNAVAILABLE'
export class DistributionDomainError extends Error {
  constructor(readonly code: DistributionDomainErrorCode, message: string) { super(message); this.name = 'DistributionDomainError' }
}

export interface DistributionServiceDependencies {
  repository: DistributionRepository
  catalog: DistributionCatalogProvider
  now: () => string
  nextId: (kind: 'plan' | 'template' | 'log') => string
}

const normalize = (value: string) => value.trim().toLocaleLowerCase()
const timestamp = (value: string) => Date.parse(value)
const configureReaders = new Set(['super-admin', 'sales-supervisor'])

export function emptyCustomerScope(type: CustomerScope['type'] = 'all'): CustomerScope {
  return { type, provinceCodes: [], cityCodes: [], districtCodes: [], categoryIds: [], tagIds: [], customerIds: [] }
}
export function createEmptyDistributionPlanDraft(now: string): DistributionPlanDraft {
  const start = new Date(now); const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  return { name: '', status: 'enabled', startsAt: start.toISOString(), endsAt: end.toISOString(), scope: emptyCustomerScope(), lines: [] }
}
export function createEmptyOrderTemplateDraft(): OrderTemplateDraft { return { name: '', status: 'enabled', selfOrderEnabled: true, scope: emptyCustomerScope(), lines: [] } }

export function minimumLegalQuantity(minimum: number | null, multiple: number): number {
  const floor = Math.max(minimum ?? 1, 1)
  return Math.ceil(floor / multiple) * multiple
}
export function isLegalQuantity(quantity: number, minimum: number | null, multiple: number): boolean {
  return Number.isInteger(quantity) && quantity >= Math.max(minimum ?? 1, 1) && quantity % multiple === 0
}
export function normalizeTemplateQuantity(quantity: number, minimum: number | null, multiple: number): number {
  return Math.ceil(Math.max(quantity, minimumLegalQuantity(minimum, multiple)) / multiple) * multiple
}

function descendants(categories: ReturnType<DistributionCatalogProvider['listCustomerCategories']>, roots: string[]): Set<string> {
  const result = new Set(roots); let changed = true
  while (changed) { changed = false; for (const category of categories) if (category.parentId && result.has(category.parentId) && !result.has(category.id)) { result.add(category.id); changed = true } }
  return result
}

export function customerMatchesScope(customer: ReturnType<DistributionCatalogProvider['listCustomers']>[number], scope: CustomerScope, categories: ReturnType<DistributionCatalogProvider['listCustomerCategories']>): boolean {
  if (scope.type === 'all') return true
  if (scope.type === 'specified') return scope.customerIds.includes(customer.id)
  const checks: boolean[] = []
  if (scope.provinceCodes.length) checks.push(scope.provinceCodes.includes(customer.provinceCode))
  if (scope.cityCodes.length) checks.push(scope.cityCodes.includes(customer.cityCode))
  if (scope.districtCodes.length) checks.push(scope.districtCodes.includes(customer.districtCode))
  if (scope.categoryIds.length) checks.push(descendants(categories, scope.categoryIds).has(customer.categoryId))
  if (scope.tagIds.length) checks.push(scope.tagIds.some((id) => customer.tagIds.includes(id)))
  return checks.length > 0 && checks.every(Boolean)
}

export function createDistributionService(dependencies: DistributionServiceDependencies) {
  const { repository, catalog } = dependencies
  const assertConfigureRead = (actor: DistributionActor) => { if (!configureReaders.has(actor.role)) throw new DistributionDomainError('PERMISSION_DENIED', '当前角色不可访问铺货与订单模板配置') }
  const assertWrite = (actor: DistributionActor) => { if (actor.role !== 'super-admin') throw new DistributionDomainError('PERMISSION_DENIED', '当前角色不可修改铺货与订单模板') }
  const assertConsumer = (actor: DistributionActor, customerId: string) => {
    if (!['super-admin', 'sales-supervisor', 'salesperson'].includes(actor.role)) throw new DistributionDomainError('PERMISSION_DENIED', '当前角色不可消费订单模板')
    if (actor.role === 'salesperson' && !actor.accessibleCustomerIds?.includes(customerId)) throw new DistributionDomainError('PERMISSION_DENIED', '业务员只能处理本人可见客户')
  }
  const page = <T>(items: T[], current = 1, size: 10 | 30 | 50 | 100 = 30): DistributionPage<T> => ({ items: items.slice((Math.max(current, 1) - 1) * size, Math.max(current, 1) * size), total: items.length, page: Math.max(current, 1), pageSize: size })
  const scopeLabel = (scope: CustomerScope) => scope.type === 'all' ? '全部客户' : scope.type === 'specified' ? `指定客户（${scope.customerIds.length}）` : '指定区域/分类/标签'
  const planItem = (item: DistributionPlan): DistributionPlanListItem => ({ ...structuredClone(item), productCount: new Set(item.lines.map((line) => line.skuId)).size, scopeLabel: scopeLabel(item.scope) })
  const templateItem = (item: OrderTemplate): OrderTemplateListItem => ({ ...structuredClone(item), productCount: new Set(item.lines.map((line) => line.skuId)).size, scopeLabel: scopeLabel(item.scope) })
  const findPlan = (state: DistributionFeatureState, id: string) => { const item = state.plans.find((entry) => entry.id === id); if (!item) throw new DistributionDomainError('NOT_FOUND', '铺货方案不存在'); return item }
  const findTemplate = (state: DistributionFeatureState, id: string) => { const item = state.templates.find((entry) => entry.id === id); if (!item) throw new DistributionDomainError('NOT_FOUND', '订单模板不存在'); return item }
  const log = (state: DistributionFeatureState, type: 'plan' | 'template', id: string, action: string, detail: string) => state.changeLogs.push({ id: dependencies.nextId('log'), enterpriseId: state.enterpriseId, targetType: type, targetId: id, action, detail, createdAt: dependencies.now() })

  function validateReferences(scope: CustomerScope, skuIds: string[]): void {
    const customers = catalog.listCustomers(); const categories = catalog.listCustomerCategories(); const skus = catalog.listSkus()
    if (scope.type === 'specified' && scope.customerIds.some((id) => !customers.some((item) => item.id === id && item.status === 'active'))) throw new DistributionDomainError('INACTIVE_REFERENCE', '指定客户必须是启用客户')
    if (scope.categoryIds.some((id) => !categories.some((item) => item.id === id))) throw new DistributionDomainError('INACTIVE_REFERENCE', '客户分类不存在')
    const regionValues = new Set(customers.flatMap((item) => [item.provinceCode, item.cityCode, item.districtCode]))
    if ([...scope.provinceCodes, ...scope.cityCodes, ...scope.districtCodes].some((id) => !regionValues.has(id))) throw new DistributionDomainError('INACTIVE_REFERENCE', '客户区域不存在')
    if (skuIds.some((id) => !skus.some((item) => item.skuId === id && item.deletedAt === null))) throw new DistributionDomainError('INACTIVE_REFERENCE', 'SKU 不存在或已淘汰')
  }

  function getWorkspaceOptions(actor: DistributionActor): DistributionWorkspaceOptions { assertConfigureRead(actor); return { clock: dependencies.now(), customers: catalog.listCustomers(), customerCategories: catalog.listCustomerCategories(), skus: catalog.listSkus() } }
  function listPlans(actor: DistributionActor, query: DistributionPlanQuery = {}): DistributionPage<DistributionPlanListItem> {
    assertConfigureRead(actor); const keyword = normalize(query.keyword ?? '')
    const items = repository.read().plans.filter((item) => (!query.status || item.status === query.status) && (!query.activeFrom || timestamp(item.endsAt) > timestamp(query.activeFrom)) && (!query.activeTo || timestamp(item.startsAt) < timestamp(query.activeTo)) && (!keyword || normalize(item.name).includes(keyword))).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)).map(planItem)
    return page(items, query.page, query.pageSize)
  }
  function getPlan(actor: DistributionActor, id: string): DistributionPlan { assertConfigureRead(actor); return structuredClone(findPlan(repository.read(), id)) }
  function savePlan(actor: DistributionActor, input: DistributionPlanDraft, id?: string): DistributionPlan {
    assertWrite(actor); assertDistributionPlanDraft(input); validateReferences(input.scope, input.lines.map((line) => line.skuId))
    return repository.transact((state) => {
      const existing = id ? findPlan(state, id) : null
      if ((!existing || input.startsAt !== existing.startsAt) && timestamp(input.startsAt) < timestamp(dependencies.now())) throw new DistributionDomainError('INVALID_TIME', '方案开始时间不能早于模拟当前时间')
      if (state.plans.some((item) => item.id !== id && normalize(item.name) === normalize(input.name))) throw new DistributionDomainError('DUPLICATE_NAME', '铺货方案名称已存在')
      const now = dependencies.now(); const item: DistributionPlan = { ...structuredClone(input), name: input.name.trim(), id: existing?.id ?? dependencies.nextId('plan'), enterpriseId: state.enterpriseId, createdBy: existing?.createdBy ?? actor.actorId, createdAt: existing?.createdAt ?? now, updatedAt: now }
      if (existing) state.plans[state.plans.indexOf(existing)] = item; else state.plans.push(item)
      log(state, 'plan', item.id, existing ? 'plan.updated' : 'plan.created', `由 ${actor.actorId} ${existing ? '更新' : '创建'}铺货方案`); return item
    })
  }
  function changePlanStatus(actor: DistributionActor, id: string, status: DistributionStatus): DistributionPlan { assertWrite(actor); return repository.transact((state) => { const item = findPlan(state, id); item.status = status; item.updatedAt = dependencies.now(); log(state, 'plan', id, 'plan.status-changed', `状态切换为 ${status}`); return item }) }

  function listTemplates(actor: DistributionActor, query: OrderTemplateQuery = {}): DistributionPage<OrderTemplateListItem> {
    assertConfigureRead(actor); const keyword = normalize(query.keyword ?? ''); const skus = catalog.listSkus()
    const items = repository.read().templates.filter((item) => (!query.status || item.status === query.status) && (!keyword || normalize(item.name).includes(keyword) || normalize(item.createdBy).includes(keyword) || item.lines.some((line) => { const sku = skus.find((entry) => entry.skuId === line.skuId); return sku && [sku.skuCode, sku.productName].some((value) => normalize(value).includes(keyword)) }))).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)).map(templateItem)
    return page(items, query.page, query.pageSize)
  }
  function getTemplate(actor: DistributionActor, id: string): OrderTemplate { assertConfigureRead(actor); return structuredClone(findTemplate(repository.read(), id)) }
  function saveTemplate(actor: DistributionActor, input: OrderTemplateDraft, id?: string): OrderTemplate {
    assertWrite(actor); assertOrderTemplateDraft(input); validateReferences(input.scope, input.lines.map((line) => line.skuId))
    return repository.transact((state) => {
      const existing = id ? findTemplate(state, id) : null
      if (state.templates.some((item) => item.id !== id && normalize(item.name) === normalize(input.name))) throw new DistributionDomainError('DUPLICATE_NAME', '订单模板名称已存在')
      const now = dependencies.now(); const item: OrderTemplate = { ...structuredClone(input), name: input.name.trim(), id: existing?.id ?? dependencies.nextId('template'), enterpriseId: state.enterpriseId, createdBy: existing?.createdBy ?? actor.actorId, createdAt: existing?.createdAt ?? now, updatedAt: now }
      if (existing) state.templates[state.templates.indexOf(existing)] = item; else state.templates.push(item)
      log(state, 'template', item.id, existing ? 'template.updated' : 'template.created', `由 ${actor.actorId} ${existing ? '更新' : '创建'}订单模板`); return item
    })
  }
  function changeTemplateStatus(actor: DistributionActor, id: string, status: DistributionStatus): OrderTemplate { assertWrite(actor); return repository.transact((state) => { const item = findTemplate(state, id); item.status = status; item.updatedAt = dependencies.now(); log(state, 'template', id, 'template.status-changed', `状态切换为 ${status}`); return item }) }

  function customer(customerId: string) { const item = catalog.listCustomers().find((entry) => entry.id === customerId); if (!item) throw new DistributionDomainError('NOT_FOUND', '客户不存在'); return item }
  function rejection(skuId: string, sourceIds: string[], quantity: number, reason: RejectedSuggestionLine['reason'], message: string): RejectedSuggestionLine { return { skuId, sourceIds, quantity, reason, message } }
  function resolveLines(customerId: string, channel: OrderChannel, lines: Array<{ skuId: string; quantity: number; sourceIds: string[] }>, normalizeQuantity: boolean, at: string): Pick<SuggestionResult, 'accepted' | 'rejected'> {
    const skus = catalog.listSkus(); const accepted: SuggestedOrderLine[] = []; const rejected: RejectedSuggestionLine[] = []
    for (const line of lines) {
      const sku = skus.find((item) => item.skuId === line.skuId)
      if (!sku) { rejected.push(rejection(line.skuId, line.sourceIds, line.quantity, 'sku-not-found', 'SKU 不存在')); continue }
      if (sku.deletedAt !== null || sku.productStatus !== 'on-sale') { rejected.push(rejection(line.skuId, line.sourceIds, line.quantity, 'product-not-on-sale', '商品已淘汰或停售')); continue }
      const authorization = catalog.resolveAuthorization(customerId, sku.productId, at)
      if (!authorization.orderable) { rejected.push(rejection(line.skuId, line.sourceIds, line.quantity, 'not-authorized', `商品不可订：${authorization.reason}`)); continue }
      const quantity = normalizeQuantity ? normalizeTemplateQuantity(line.quantity, sku.minimumOrderQuantity, sku.orderMultiple) : line.quantity
      if (!normalizeQuantity && !isLegalQuantity(quantity, sku.minimumOrderQuantity, sku.orderMultiple)) { rejected.push(rejection(line.skuId, line.sourceIds, line.quantity, 'quantity-invalid', '数量不满足起订量或订货倍数')); continue }
      accepted.push({ skuId: sku.skuId, skuCode: sku.skuCode, productName: sku.productName, specification: sku.specification, quantity, originalQuantity: line.quantity, unitId: sku.baseUnitId, unitName: sku.baseUnitName, marketPriceCents: sku.marketPriceCents, sourceIds: [...line.sourceIds].sort(), sourceKey: `${channel}:${[...line.sourceIds].sort().join('+')}:${sku.skuId}`, reasons: quantity !== line.quantity ? ['quantity-normalized'] : [] })
    }
    return { accepted, rejected }
  }

  function resolveDistribution(actor: DistributionActor, customerId: string, channel: OrderChannel, at = dependencies.now()): SuggestionResult {
    assertConsumer(actor, customerId); if (channel === 'assisted-order') return { channel, applicable: false, accepted: [], rejected: [] }
    const current = customer(customerId)
    if (current.status !== 'active') return { channel, applicable: false, accepted: [], rejected: [rejection('', [], 0, 'customer-not-active', '客户不是启用状态')] }
    if (!current.canSelfOrder) return { channel, applicable: false, accepted: [], rejected: [rejection('', [], 0, 'self-order-disabled', '客户未开启自主下单')] }
    const categories = catalog.listCustomerCategories(); const aggregated = new Map<string, { skuId: string; quantity: number; sourceIds: string[] }>()
    for (const plan of repository.read().plans.filter((item) => item.status === 'enabled' && timestamp(item.startsAt) <= timestamp(at) && timestamp(at) < timestamp(item.endsAt) && customerMatchesScope(current, item.scope, categories))) {
      for (const line of plan.lines) { const existing = aggregated.get(line.skuId) ?? { skuId: line.skuId, quantity: 0, sourceIds: [] }; existing.quantity += line.quantity; existing.sourceIds.push(plan.id); aggregated.set(line.skuId, existing) }
    }
    return { channel, applicable: true, ...resolveLines(customerId, channel, [...aggregated.values()], false, at) }
  }

  function loadTemplate(actor: DistributionActor, templateId: string, customerId: string, channel: OrderChannel, at = dependencies.now()): SuggestionResult {
    assertConsumer(actor, customerId); const template = findTemplate(repository.read(), templateId); const current = customer(customerId); const categories = catalog.listCustomerCategories()
    if (current.status !== 'active') return { channel, applicable: false, accepted: [], rejected: [rejection('', [template.id], 0, 'customer-not-active', '客户不是启用状态')] }
    if (template.status !== 'enabled' || (channel === 'mobile-self-order' && !template.selfOrderEnabled)) return { channel, applicable: false, accepted: [], rejected: [rejection('', [template.id], 0, 'template-not-available', '模板在当前渠道不可用')] }
    if (channel === 'mobile-self-order' && !current.canSelfOrder) return { channel, applicable: false, accepted: [], rejected: [rejection('', [template.id], 0, 'self-order-disabled', '客户未开启自主下单')] }
    if (!customerMatchesScope(current, template.scope, categories)) return { channel, applicable: false, accepted: [], rejected: [rejection('', [template.id], 0, 'scope-not-matched', '客户不在模板适用范围')] }
    return { channel, applicable: true, ...resolveLines(customerId, channel, template.lines.map((line) => ({ ...line, sourceIds: [template.id] })), true, at) }
  }

  function getStatistics(actor: DistributionActor): DistributionStatisticsResult { assertConfigureRead(actor); return { status: 'unavailable', message: '订单数据源未接入，暂不能计算已订货数量与客户数', items: [] } }
  function exportStatisticsCsv(actor: DistributionActor): never { assertConfigureRead(actor); throw new DistributionDomainError('DATA_PROVIDER_UNAVAILABLE', '订单数据源未接入，暂不能导出执行统计') }
  return { getWorkspaceOptions, listPlans, getPlan, savePlan, changePlanStatus, listTemplates, getTemplate, saveTemplate, changeTemplateStatus, resolveDistribution, loadTemplate, getStatistics, exportStatisticsCsv }
}
