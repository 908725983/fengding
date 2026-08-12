import type { AuthorizationRepository } from '../repositories/authorization-repository'
import { assertAuthorizationPlanDraft, assertAuthorizationRuleDraft, assertSpecialAuthorizationBatchDraft } from '../schemas/authorization-schema'
import type {
  AuthorizationActor, AuthorizationCatalog, AuthorizationChangeLog, AuthorizationFeatureState, AuthorizationImportPreview, AuthorizationPage, AuthorizationPlan,
  AuthorizationPlanDraft, AuthorizationPlanListItem, AuthorizationPlanQuery, AuthorizationResolution, AuthorizationResolutionSource,
  AuthorizationRule, AuthorizationRuleDraft, AuthorizationRuleListItem, AuthorizationRuleQuery, AuthorizationWorkspaceOptions,
  ProductAuthorizationDetail, SpecialAuthorization, SpecialAuthorizationBatchDraft, SpecialAuthorizationListItem,
  SpecialAuthorizationDraft, SpecialAuthorizationQuery, SpecialAuthorizationType, Weekday,
} from '../types'

export type AuthorizationDomainErrorCode = 'PERMISSION_DENIED' | 'NOT_FOUND' | 'DUPLICATE_NAME' | 'INACTIVE_REFERENCE' | 'REFERENCE_CONFLICT' | 'OVERLAPPING_PERIOD' | 'INVALID_TIME' | 'INVALID_CSV'
export class AuthorizationDomainError extends Error {
  constructor(readonly code: AuthorizationDomainErrorCode, message: string) { super(message); this.name = 'AuthorizationDomainError' }
}

export interface AuthorizationServiceDependencies {
  repository: AuthorizationRepository
  getCatalog: () => AuthorizationCatalog
  now: () => string
  nextId: (kind: 'plan' | 'rule' | 'special' | 'log') => string
}

const configurationReaders = new Set(['super-admin', 'sales-supervisor'])
const resolutionReaders = new Set(['super-admin', 'sales-supervisor', 'salesperson', 'warehouse'])
const normalize = (value: string) => value.trim().toLocaleLowerCase()
const specialWeight: Record<SpecialAuthorizationType, number> = { 'visible-orderable': 1, 'visible-only': 2, prohibited: 3 }

function assertConfigureRead(actor: AuthorizationActor): void {
  if (!configurationReaders.has(actor.role)) throw new AuthorizationDomainError('PERMISSION_DENIED', '当前角色不可访问商品授权配置')
}
function assertResolutionRead(actor: AuthorizationActor): void {
  if (!resolutionReaders.has(actor.role)) throw new AuthorizationDomainError('PERMISSION_DENIED', '当前角色不可查看商品授权结果')
}
function assertWrite(actor: AuthorizationActor): void {
  if (actor.role !== 'super-admin') throw new AuthorizationDomainError('PERMISSION_DENIED', '当前角色不可修改商品授权配置')
}
function paginate<T>(items: T[], page = 1, pageSize = 30): AuthorizationPage<T> {
  const safePage = Math.max(1, page); const start = (safePage - 1) * pageSize
  return { items: items.slice(start, start + pageSize), total: items.length, page: safePage, pageSize }
}
function categoryDescendants(catalog: AuthorizationCatalog, roots: string[]): Set<string> {
  const result = new Set(roots); let changed = true
  while (changed) {
    changed = false
    for (const category of catalog.categories) if (category.parentId && result.has(category.parentId) && !result.has(category.id)) { result.add(category.id); changed = true }
  }
  return result
}
export function resolvePlanProductIds(plan: AuthorizationPlan, catalog: AuthorizationCatalog): string[] {
  const available = catalog.products.filter((product) => product.deletedAt === null)
  const categoryIds = categoryDescendants(catalog, plan.categoryIds)
  const byCategory = new Set(available.filter((product) => categoryIds.has(product.categoryId)).map((product) => product.id))
  const byBrand = new Set(available.filter((product) => product.brandId && plan.brandIds.includes(product.brandId)).map((product) => product.id))
  let ranged = new Set<string>()
  if (plan.categoryIds.length && plan.brandIds.length) ranged = new Set([...byCategory].filter((id) => byBrand.has(id)))
  else if (plan.categoryIds.length) ranged = byCategory
  else if (plan.brandIds.length) ranged = byBrand
  return [...new Set([...ranged, ...plan.productIds.filter((id) => available.some((product) => product.id === id))])]
}
function effectiveSpecial(item: SpecialAuthorization, at: string): boolean { return item.deletedAt === null && item.startsAt <= at && (item.endsAt === null || at < item.endsAt) }
function weekdayAndMinute(at: string): { weekday: Weekday; minute: string } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(at))
  const weekdayMap: Record<string, Weekday> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return { weekday: weekdayMap[value.weekday], minute: `${value.hour}:${value.minute}` }
}
function ruleEffective(rule: AuthorizationRule, at: string): boolean {
  if (rule.deletedAt !== null) return false
  const local = weekdayAndMinute(at)
  return rule.weekdays.includes(local.weekday) && rule.timeRanges.some((range) => range.start <= local.minute && local.minute < range.end)
}
function overlap(aStart: string, aEnd: string | null, bStart: string, bEnd: string | null): boolean {
  return aStart < (bEnd ?? '9999-12-31T23:59:59+08:00') && bStart < (aEnd ?? '9999-12-31T23:59:59+08:00')
}

export function createAuthorizationService(dependencies: AuthorizationServiceDependencies) {
  const { repository } = dependencies
  const catalog = () => structuredClone(dependencies.getCatalog())
  const findPlan = (state: AuthorizationFeatureState, id: string) => {
    const item = state.plans.find((plan) => plan.id === id && plan.deletedAt === null); if (!item) throw new AuthorizationDomainError('NOT_FOUND', '授权方案不存在'); return item
  }
  const findRule = (state: AuthorizationFeatureState, id: string) => {
    const item = state.rules.find((rule) => rule.id === id && rule.deletedAt === null); if (!item) throw new AuthorizationDomainError('NOT_FOUND', '授权规则不存在'); return item
  }
  const appendLog = (state: AuthorizationFeatureState, entityType: AuthorizationChangeLog['entityType'], entityId: string, action: string, detail: string) => {
    state.changeLogs.push({ id: dependencies.nextId('log'), enterpriseId: state.enterpriseId, entityType, entityId, action, detail, createdAt: dependencies.now() })
  }
  const validatePlanReferences = (draft: AuthorizationPlanDraft) => {
    const data = catalog()
    for (const id of draft.categoryIds) if (!data.categories.some((item) => item.id === id && item.status === 'active')) throw new AuthorizationDomainError('INACTIVE_REFERENCE', '只能选择启用的商品分类')
    for (const id of draft.brandIds) if (!data.brands.some((item) => item.id === id && item.status === 'active')) throw new AuthorizationDomainError('INACTIVE_REFERENCE', '只能选择启用的商品品牌')
    for (const id of draft.productIds) if (!data.products.some((item) => item.id === id && item.deletedAt === null)) throw new AuthorizationDomainError('INACTIVE_REFERENCE', '只能选择未删除商品')
    for (const id of draft.customerIds) if (!data.customers.some((item) => item.id === id && item.status === 'active')) throw new AuthorizationDomainError('INACTIVE_REFERENCE', '只能选择启用客户')
  }
  const planItem = (plan: AuthorizationPlan): AuthorizationPlanListItem => {
    const data = catalog(); const ids = resolvePlanProductIds(plan, data)
    return { ...structuredClone(plan), productCount: ids.length, categoryNames: data.categories.filter((item) => plan.categoryIds.includes(item.id)).map((item) => item.name) }
  }
  const specialItem = (item: SpecialAuthorization): SpecialAuthorizationListItem => {
    const data = catalog(); const customer = data.customers.find((entry) => entry.id === item.customerId); const product = data.products.find((entry) => entry.id === item.productId)
    return { ...structuredClone(item), customerName: customer?.name ?? '客户资料不可用', customerCode: customer?.code ?? item.customerId, customerCategoryName: customer?.categoryName ?? '—', productName: product?.name ?? '商品资料不可用', productCode: product?.code ?? item.productId }
  }

  function getWorkspaceOptions(actor: AuthorizationActor): AuthorizationWorkspaceOptions { assertConfigureRead(actor); return { ...catalog(), clock: dependencies.now() } }
  function listPlans(actor: AuthorizationActor, query: AuthorizationPlanQuery = {}): AuthorizationPage<AuthorizationPlanListItem> {
    assertConfigureRead(actor); const keyword = normalize(query.keyword ?? '')
    const items = repository.read().plans.filter((item) => item.deletedAt === null && (!query.status || item.status === query.status) && (!keyword || normalize(item.name).includes(keyword)))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(planItem)
    return paginate(items, query.page, query.pageSize)
  }
  function getPlan(actor: AuthorizationActor, id: string): AuthorizationPlan { assertConfigureRead(actor); return structuredClone(findPlan(repository.read(), id)) }
  function createPlan(actor: AuthorizationActor, input: AuthorizationPlanDraft): AuthorizationPlan {
    assertWrite(actor); assertAuthorizationPlanDraft(input); validatePlanReferences(input)
    return repository.transact((state) => {
      if (state.plans.some((item) => item.deletedAt === null && normalize(item.name) === normalize(input.name))) throw new AuthorizationDomainError('DUPLICATE_NAME', '授权方案名称已存在')
      const timestamp = dependencies.now(); const code = `AUTH-${String(state.nextPlanSequence++).padStart(6, '0')}`
      const plan: AuthorizationPlan = { ...structuredClone(input), name: input.name.trim(), id: dependencies.nextId('plan'), enterpriseId: state.enterpriseId, code, createdAt: timestamp, updatedAt: timestamp, deletedAt: null }
      state.plans.push(plan); appendLog(state, 'plan', plan.id, 'plan.created', `由 ${actor.actorId} 创建方案 ${code}`); return plan
    })
  }
  function updatePlan(actor: AuthorizationActor, id: string, input: AuthorizationPlanDraft): AuthorizationPlan {
    assertWrite(actor); assertAuthorizationPlanDraft(input); validatePlanReferences(input)
    return repository.transact((state) => {
      const current = findPlan(state, id)
      if (state.plans.some((item) => item.id !== id && item.deletedAt === null && normalize(item.name) === normalize(input.name))) throw new AuthorizationDomainError('DUPLICATE_NAME', '授权方案名称已存在')
      const updated = { ...current, ...structuredClone(input), name: input.name.trim(), updatedAt: dependencies.now() }
      state.plans[state.plans.indexOf(current)] = updated; appendLog(state, 'plan', id, 'plan.updated', `由 ${actor.actorId} 更新方案`); return updated
    })
  }
  function deletePlan(actor: AuthorizationActor, id: string): void {
    assertWrite(actor); repository.transact((state) => {
      const current = findPlan(state, id)
      if (state.rules.some((item) => item.planId === id && item.deletedAt === null)) throw new AuthorizationDomainError('REFERENCE_CONFLICT', '授权方案存在规则引用，不能删除')
      current.deletedAt = dependencies.now(); current.updatedAt = dependencies.now(); appendLog(state, 'plan', id, 'plan.deleted', `由 ${actor.actorId} 删除方案`)
    })
  }
  function addProductToPlans(actor: AuthorizationActor, productId: string, planIds: string[]): void {
    assertWrite(actor); const data = catalog(); if (!data.products.some((item) => item.id === productId && item.deletedAt === null)) throw new AuthorizationDomainError('NOT_FOUND', '商品不存在')
    repository.transact((state) => { for (const id of [...new Set(planIds)]) { const plan = findPlan(state, id); if (!plan.productIds.includes(productId)) plan.productIds.push(productId); plan.updatedAt = dependencies.now(); appendLog(state, 'plan', id, 'plan.product-linked', `关联商品 ${productId}`) } })
  }
  function listRules(actor: AuthorizationActor, query: AuthorizationRuleQuery = {}): AuthorizationPage<AuthorizationRuleListItem> {
    assertConfigureRead(actor); const state = repository.read(); const keyword = normalize(query.keyword ?? '')
    const items = state.rules.filter((item) => item.deletedAt === null && (!query.planId || item.planId === query.planId) && (!keyword || normalize(item.name).includes(keyword)))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((item) => ({ ...item, planName: state.plans.find((plan) => plan.id === item.planId)?.name ?? '方案不可用' }))
    return paginate(items, query.page, query.pageSize)
  }
  function getRule(actor: AuthorizationActor, id: string): AuthorizationRule { assertConfigureRead(actor); return structuredClone(findRule(repository.read(), id)) }
  const validateRuleReferences = (state: AuthorizationFeatureState, draft: AuthorizationRuleDraft) => {
    findPlan(state, draft.planId); const data = catalog()
    for (const id of draft.customerIds) if (!data.customers.some((item) => item.id === id && item.status === 'active')) throw new AuthorizationDomainError('INACTIVE_REFERENCE', '规则只能选择启用客户')
  }
  function createRule(actor: AuthorizationActor, input: AuthorizationRuleDraft): AuthorizationRule {
    assertWrite(actor); assertAuthorizationRuleDraft(input)
    return repository.transact((state) => { validateRuleReferences(state, input); if (state.rules.some((item) => item.deletedAt === null && normalize(item.name) === normalize(input.name))) throw new AuthorizationDomainError('DUPLICATE_NAME', '授权规则名称已存在')
      const timestamp = dependencies.now(); const rule: AuthorizationRule = { ...structuredClone(input), name: input.name.trim(), id: dependencies.nextId('rule'), enterpriseId: state.enterpriseId, createdAt: timestamp, updatedAt: timestamp, deletedAt: null }
      state.rules.push(rule); appendLog(state, 'rule', rule.id, 'rule.created', `由 ${actor.actorId} 创建规则`); return rule })
  }
  function updateRule(actor: AuthorizationActor, id: string, input: AuthorizationRuleDraft): AuthorizationRule {
    assertWrite(actor); assertAuthorizationRuleDraft(input)
    return repository.transact((state) => { const current = findRule(state, id); validateRuleReferences(state, input); if (state.rules.some((item) => item.id !== id && item.deletedAt === null && normalize(item.name) === normalize(input.name))) throw new AuthorizationDomainError('DUPLICATE_NAME', '授权规则名称已存在')
      const updated = { ...current, ...structuredClone(input), name: input.name.trim(), updatedAt: dependencies.now() }; state.rules[state.rules.indexOf(current)] = updated; appendLog(state, 'rule', id, 'rule.updated', `由 ${actor.actorId} 更新规则`); return updated })
  }
  function deleteRule(actor: AuthorizationActor, id: string): void { assertWrite(actor); repository.transact((state) => { const current = findRule(state, id); current.deletedAt = dependencies.now(); current.updatedAt = dependencies.now(); appendLog(state, 'rule', id, 'rule.deleted', `由 ${actor.actorId} 删除规则`) }) }
  function listSpecials(actor: AuthorizationActor, query: SpecialAuthorizationQuery = {}): AuthorizationPage<SpecialAuthorizationListItem> {
    assertConfigureRead(actor); const data = catalog(); const keyword = normalize(query.customerKeyword ?? ''); const now = dependencies.now()
    const items = repository.read().specials.filter((item) => item.deletedAt === null && (!query.type || item.type === query.type) && (!keyword || data.customers.some((customer) => customer.id === item.customerId && [customer.name, customer.code].some((value) => normalize(value).includes(keyword)))) && (!query.effective || (query.effective === 'effective' ? effectiveSpecial(item, now) : query.effective === 'future' ? item.startsAt > now : item.endsAt !== null && item.endsAt <= now)))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(specialItem)
    return paginate(items, query.page, query.pageSize)
  }
  function createSpecialBatch(actor: AuthorizationActor, input: SpecialAuthorizationBatchDraft): SpecialAuthorization[] {
    assertWrite(actor); assertSpecialAuthorizationBatchDraft(input); const now = dependencies.now(); if (input.startsAt < now) throw new AuthorizationDomainError('INVALID_TIME', '特殊授权开始时间不能早于模拟当前时间')
    const data = catalog(); for (const id of input.customerIds) if (!data.customers.some((item) => item.id === id && item.status === 'active')) throw new AuthorizationDomainError('INACTIVE_REFERENCE', '只能选择启用客户')
    for (const id of input.productIds) if (!data.products.some((item) => item.id === id && item.deletedAt === null)) throw new AuthorizationDomainError('INACTIVE_REFERENCE', '只能选择未删除商品')
    return repository.transact((state) => {
      for (const customerId of input.customerIds) for (const productId of input.productIds) if (state.specials.some((item) => item.deletedAt === null && item.customerId === customerId && item.productId === productId && overlap(input.startsAt, input.endsAt, item.startsAt, item.endsAt))) throw new AuthorizationDomainError('OVERLAPPING_PERIOD', '同一客户和商品的特殊授权有效期不能重叠')
      const created: SpecialAuthorization[] = []
      for (const customerId of input.customerIds) for (const productId of input.productIds) { const item: SpecialAuthorization = { id: dependencies.nextId('special'), enterpriseId: state.enterpriseId, customerId, productId, type: input.type, startsAt: input.startsAt, endsAt: input.endsAt, note: input.note?.trim() || null, createdAt: now, updatedAt: now, deletedAt: null }; state.specials.push(item); created.push(item); appendLog(state, 'special', item.id, 'special.created', `由 ${actor.actorId} 创建特殊授权`) }
      return created
    })
  }
  function updateSpecial(actor: AuthorizationActor, id: string, input: SpecialAuthorizationDraft): SpecialAuthorization {
    assertWrite(actor)
    return repository.transact((state) => {
      const current = state.specials.find((item) => item.id === id && item.deletedAt === null)
      if (!current) throw new AuthorizationDomainError('NOT_FOUND', '特殊授权不存在')
      assertSpecialAuthorizationBatchDraft({ customerIds: [current.customerId], productIds: [current.productId], ...input })
      if (input.startsAt !== current.startsAt && input.startsAt < dependencies.now()) throw new AuthorizationDomainError('INVALID_TIME', '修改后的开始时间不能早于模拟当前时间')
      if (state.specials.some((item) => item.id !== id && item.deletedAt === null && item.customerId === current.customerId && item.productId === current.productId && overlap(input.startsAt, input.endsAt, item.startsAt, item.endsAt))) throw new AuthorizationDomainError('OVERLAPPING_PERIOD', '同一客户和商品的特殊授权有效期不能重叠')
      Object.assign(current, structuredClone(input), { note: input.note?.trim() || null, updatedAt: dependencies.now() }); appendLog(state, 'special', id, 'special.updated', `由 ${actor.actorId} 更新特殊授权`); return current
    })
  }
  function deleteSpecial(actor: AuthorizationActor, id: string): void { assertWrite(actor); repository.transact((state) => { const item = state.specials.find((entry) => entry.id === id && entry.deletedAt === null); if (!item) throw new AuthorizationDomainError('NOT_FOUND', '特殊授权不存在'); item.deletedAt = dependencies.now(); item.updatedAt = dependencies.now(); appendLog(state, 'special', id, 'special.deleted', `由 ${actor.actorId} 删除特殊授权`) }) }
  function resolveAuthorization(actor: AuthorizationActor, customerId: string, productId: string, at = dependencies.now()): AuthorizationResolution {
    assertResolutionRead(actor); const data = catalog(); const customer = data.customers.find((item) => item.id === customerId); const product = data.products.find((item) => item.id === productId && item.deletedAt === null)
    if (!customer || customer.status !== 'active') return { customerId, productId, visible: false, orderable: false, reason: 'customer-not-active', sources: [] }
    if (!product || product.status !== 'on-sale') return { customerId, productId, visible: false, orderable: false, reason: 'product-not-on-sale', sources: [] }
    const state = repository.read(); const sources: AuthorizationResolutionSource[] = []
    for (const plan of state.plans.filter((item) => item.deletedAt === null && item.status === 'enabled')) {
      if (!resolvePlanProductIds(plan, data).includes(productId)) continue
      if (plan.customerIds.includes(customerId)) sources.push({ type: 'direct-plan', id: plan.id, label: plan.name })
      for (const rule of state.rules.filter((item) => item.planId === plan.id && item.customerIds.includes(customerId) && ruleEffective(item, at))) sources.push({ type: 'timed-rule', id: rule.id, label: rule.name })
    }
    const specials = state.specials.filter((item) => item.customerId === customerId && item.productId === productId && effectiveSpecial(item, at)).sort((a, b) => specialWeight[b.type] - specialWeight[a.type])
    if (specials.length) {
      const strongest = specials[0]; sources.push({ type: 'special', id: strongest.id, label: strongest.type })
      if (strongest.type === 'prohibited') return { customerId, productId, visible: false, orderable: false, reason: 'special-prohibited', sources }
      if (strongest.type === 'visible-only') return { customerId, productId, visible: true, orderable: false, reason: 'special-visible-only', sources }
      return { customerId, productId, visible: true, orderable: true, reason: 'allowed', sources }
    }
    return sources.length ? { customerId, productId, visible: true, orderable: true, reason: 'allowed', sources } : { customerId, productId, visible: false, orderable: false, reason: 'no-authorization', sources: [] }
  }
  function getProductAuthorizationDetail(actor: AuthorizationActor, productId: string): ProductAuthorizationDetail {
    assertConfigureRead(actor); const state = repository.read(); const data = catalog(); if (!data.products.some((item) => item.id === productId && item.deletedAt === null)) throw new AuthorizationDomainError('NOT_FOUND', '商品不存在')
    return { productId, plans: state.plans.filter((plan) => plan.deletedAt === null && resolvePlanProductIds(plan, data).includes(productId)).map(planItem), specials: state.specials.filter((item) => item.deletedAt === null && item.productId === productId).map(specialItem) }
  }
  function exportPlansCsv(actor: AuthorizationActor, selectedIds: string[], query: AuthorizationPlanQuery = {}): string {
    assertWrite(actor); const page = listPlans(actor, { ...query, page: 1, pageSize: 100 }); const selected = selectedIds.length ? page.items.filter((item) => selectedIds.includes(item.id)) : page.items; const data = catalog(); const rows = ['planCode,planName,status,productCode,productName']
    for (const plan of selected) for (const productId of resolvePlanProductIds(plan, data)) { const product = data.products.find((item) => item.id === productId)!; rows.push([plan.code, plan.name, plan.status, product.code, product.name].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')) }
    return rows.join('\n')
  }
  function previewPlanProductsCsv(actor: AuthorizationActor, planId: string, csv: string): AuthorizationImportPreview {
    assertWrite(actor); findPlan(repository.read(), planId)
    const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim())
    if (!lines.length || normalize(lines[0].replaceAll('"', '')) !== 'productcode') throw new AuthorizationDomainError('INVALID_CSV', 'CSV 首列必须为 productCode')
    const data = catalog(); const seen = new Set<string>()
    const rows = lines.slice(1).map((line, index) => {
      const productCode = line.trim().replace(/^"|"$/g, '').replaceAll('""', '"').trim(); const key = normalize(productCode)
      const product = data.products.find((item) => normalize(item.code) === key && item.deletedAt === null)
      if (!product) return { row: index + 2, productCode, productId: null, productName: null, status: 'error' as const, message: '商品编码不存在或商品已删除' }
      if (seen.has(key)) return { row: index + 2, productCode, productId: product.id, productName: product.name, status: 'duplicate' as const, message: '文件内重复，将去重' }
      seen.add(key); return { row: index + 2, productCode, productId: product.id, productName: product.name, status: 'valid' as const, message: '可导入' }
    })
    return { rows, validCount: rows.filter((row) => row.status === 'valid').length, errorCount: rows.filter((row) => row.status === 'error').length }
  }
  function importPlanProductsCsv(actor: AuthorizationActor, planId: string, csv: string): AuthorizationPlan {
    const preview = previewPlanProductsCsv(actor, planId, csv)
    if (preview.errorCount) throw new AuthorizationDomainError('INVALID_CSV', 'CSV 存在错误行，整批未导入')
    const productIds = [...new Set(preview.rows.flatMap((row) => row.productId ? [row.productId] : []))]
    return repository.transact((state) => { const plan = findPlan(state, planId); plan.productIds = [...new Set([...plan.productIds, ...productIds])]; plan.updatedAt = dependencies.now(); appendLog(state, 'plan', planId, 'plan.products-imported', `由 ${actor.actorId} 导入 ${productIds.length} 个商品`); return plan })
  }
  return { getWorkspaceOptions, listPlans, getPlan, createPlan, updatePlan, deletePlan, addProductToPlans, listRules, getRule, createRule, updateRule, deleteRule, listSpecials, createSpecialBatch, updateSpecial, deleteSpecial, resolveAuthorization, getProductAuthorizationDetail, exportPlansCsv, previewPlanProductsCsv, importPlanProductsCsv }
}
