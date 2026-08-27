import { assertCategoryDraft, assertCustomerDraft, assertTagDraft } from '../schemas/customer-schema'
import type { CustomerRepository } from '../repositories/customer-repository'
import {
  defaultCustomerBusinessSettings,
  type Customer,
  type CustomerActor,
  type CustomerCategory,
  type CustomerCategoryDraft,
  type CustomerDraft,
  type CustomerFeatureState,
  type CustomerListItem,
  type CustomerListQuery,
  type CustomerOrderEligibility,
  type CustomerStatus,
  type CustomerTag,
  type CustomerTagDraft,
  type CustomerTagSuggestion,
  type EntityId,
  type ImmediateAnalysisInput,
  type PageResult,
  type SettlementMethod,
} from '../types'

export type CustomerDomainErrorCode =
  | 'PERMISSION_DENIED'
  | 'NOT_FOUND'
  | 'DUPLICATE_CODE'
  | 'INACTIVE_REFERENCE'
  | 'REFERENCE_CONFLICT'
  | 'INVALID_TRANSITION'
  | 'SENSITIVE_FIELD_FORBIDDEN'
  | 'DATA_PROVIDER_UNAVAILABLE'
  | 'ANALYSIS_RANGE_INVALID'
  | 'SUGGESTION_NOT_PENDING'

export class CustomerDomainError extends Error {
  constructor(readonly code: CustomerDomainErrorCode, message: string) {
    super(message)
    this.name = 'CustomerDomainError'
  }
}

export interface CustomerServiceDependencies {
  repository: CustomerRepository
  now: () => string
  nextId: (kind: string) => string
  staffNames: Readonly<Record<string, string>>
}

const readableRoles = new Set(['super-admin', 'sales-supervisor', 'salesperson'])
const writableRoles = new Set(['super-admin', 'sales-supervisor', 'salesperson'])

function assertRead(actor: CustomerActor): void {
  if (!readableRoles.has(actor.role)) throw new CustomerDomainError('PERMISSION_DENIED', '当前角色不可访问客户模块')
}

function assertWrite(actor: CustomerActor): void {
  if (!writableRoles.has(actor.role)) throw new CustomerDomainError('PERMISSION_DENIED', '当前角色不可修改客户资料')
}

function findCustomer(state: CustomerFeatureState, id: EntityId): Customer {
  const customer = state.customers.find((item) => item.id === id)
  if (!customer) throw new CustomerDomainError('NOT_FOUND', '客户不存在')
  return customer
}

function findCategory(state: CustomerFeatureState, id: EntityId): CustomerCategory {
  const category = state.categories.find((item) => item.id === id)
  if (!category) throw new CustomerDomainError('NOT_FOUND', '客户分类不存在')
  return category
}

function findTag(state: CustomerFeatureState, id: EntityId): CustomerTag {
  const tag = state.tags.find((item) => item.id === id)
  if (!tag) throw new CustomerDomainError('NOT_FOUND', '客户标签不存在')
  return tag
}

function sameCode(left: string, right: string): boolean {
  return left.trim().toLocaleLowerCase() === right.trim().toLocaleLowerCase()
}

function maskSensitive(value: string | null): string | null {
  if (!value) return value
  const visible = value.slice(-4)
  return `${'*'.repeat(Math.max(4, value.length - 4))}${visible}`
}

function descendantCategoryIds(state: CustomerFeatureState, rootId: string): Set<string> {
  const result = new Set([rootId])
  let changed = true
  while (changed) {
    changed = false
    for (const category of state.categories) {
      if (category.parentId && result.has(category.parentId) && !result.has(category.id)) {
        result.add(category.id)
        changed = true
      }
    }
  }
  return result
}

function appendLog(state: CustomerFeatureState, dependencies: CustomerServiceDependencies, customerId: string, action: string, detail: string): void {
  state.changeLogs.push({
    id: dependencies.nextId('log'), enterpriseId: state.enterpriseId, customerId, action, detail, createdAt: dependencies.now(),
  })
}

export function createEmptyCustomerDraft(): CustomerDraft {
  return {
    codeMode: 'manual', code: '', name: '', categoryId: '', customerType: null, source: null, importanceLevel: null,
    primaryContactName: '', primaryPhone: '', backupPhone: null, provinceCode: '', cityCode: '', districtCode: '', address: '', addressLabel: null,
    longitude: null, latitude: null, email: null, wechatId: null, salespersonId: '', creditLimitCents: null,
    settlementMethod: 'cash', paymentTermDays: null, paymentMethods: [], bankName: null, bankAccount: null, taxId: null, invoiceTitle: null,
    description: null, remark: null, attachments: [], tagIds: [], businessSettings: defaultCustomerBusinessSettings(), legalRepresentative: null,
    registeredCapital: null, establishedDate: null, businessScope: null, storeArea: null, employeeCount: null, status: 'active', frozenReason: null,
  }
}

export function applyCategoryToDraft(draft: CustomerDraft, category: CustomerCategory): CustomerDraft {
  const next: CustomerDraft = {
    ...draft,
    attachments: draft.attachments.map((item) => ({ ...item })),
    tagIds: [...draft.tagIds],
    paymentMethods: [...draft.paymentMethods],
    businessSettings: { ...draft.businessSettings },
  }
  next.categoryId = category.id
  next.creditLimitCents = category.defaultCreditLimitCents
  if (category.defaultPaymentTermDays !== null) {
    next.settlementMethod = 'terms'
    next.paymentTermDays = category.defaultPaymentTermDays
  }
  return next
}

export function changeSettlementMethod(draft: CustomerDraft, method: SettlementMethod): CustomerDraft {
  return { ...draft, settlementMethod: method, paymentTermDays: method === 'terms' ? draft.paymentTermDays : null }
}

export function getOrderEligibility(customer: Customer, exposureCents: number): CustomerOrderEligibility {
  if (customer.status !== 'active') return { allowed: false, reason: 'customer-not-active' }
  if (customer.creditLimitCents !== null && customer.creditLimitCents > 0 && exposureCents > customer.creditLimitCents) {
    return { allowed: false, reason: 'credit-limit-exceeded' }
  }
  return { allowed: true, reason: 'ok' }
}

export function createCustomerService(dependencies: CustomerServiceDependencies) {
  const { repository } = dependencies

  function validateReferences(state: CustomerFeatureState, draft: CustomerDraft, previous?: Customer): void {
    const category = findCategory(state, draft.categoryId)
    if (category.status !== 'active' && previous?.categoryId !== category.id) throw new CustomerDomainError('INACTIVE_REFERENCE', '停用分类不能新分配')
    for (const tagId of draft.tagIds) {
      const tag = findTag(state, tagId)
      if (tag.status !== 'active' && !previous?.tagIds.includes(tagId)) throw new CustomerDomainError('INACTIVE_REFERENCE', '停用标签不能新分配')
    }
  }

  function listCustomers(actor: CustomerActor, query: CustomerListQuery = {}): PageResult<CustomerListItem> {
    assertRead(actor)
    if (query.transactionMinCents !== undefined || query.transactionMaxCents !== undefined) {
      throw new CustomerDomainError('DATA_PROVIDER_UNAVAILABLE', '交易金额数据源尚未接入')
    }
    const state = repository.read()
    const categoryScope = query.categoryId ? descendantCategoryIds(state, query.categoryId) : null
    const keyword = query.keyword?.trim().toLocaleLowerCase()
    const filtered = state.customers.filter((customer) => {
      if (categoryScope && !categoryScope.has(customer.categoryId)) return false
      if (query.tagIds?.length && !query.tagIds.some((id) => customer.tagIds.includes(id))) return false
      if (query.salespersonId && customer.salespersonId !== query.salespersonId) return false
      if (query.status && customer.status !== query.status) return false
      if (query.regionCodes?.length && !query.regionCodes.every((code) => [customer.provinceCode, customer.cityCode, customer.districtCode].includes(code))) return false
      if (query.registeredFrom && customer.createdAt < query.registeredFrom) return false
      if (query.registeredTo && customer.createdAt > query.registeredTo) return false
      if (keyword && ![customer.name, customer.code, customer.primaryContactName, customer.primaryPhone].some((value) => value.toLocaleLowerCase().includes(keyword))) return false
      return true
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
    const page = Math.max(1, query.page ?? 1)
    const pageSize = query.pageSize ?? 30
    const start = (page - 1) * pageSize
    return {
      total: filtered.length, page, pageSize,
      items: filtered.slice(start, start + pageSize).map((customer) => ({
        ...customer,
        bankAccount: actor.role === 'super-admin' ? customer.bankAccount : maskSensitive(customer.bankAccount),
        taxId: actor.role === 'super-admin' ? customer.taxId : maskSensitive(customer.taxId),
        categoryName: state.categories.find((item) => item.id === customer.categoryId)?.name ?? '未分类',
        salespersonName: dependencies.staffNames[customer.salespersonId] ?? '未知业务员',
        orderCount: null, consumptionAmountCents: null, receivableBalanceCents: null,
      })),
    }
  }

  function getCustomer(actor: CustomerActor, id: EntityId): Customer {
    assertRead(actor)
    const customer = findCustomer(repository.read(), id)
    return {
      ...customer,
      bankAccount: actor.role === 'super-admin' ? customer.bankAccount : maskSensitive(customer.bankAccount),
      taxId: actor.role === 'super-admin' ? customer.taxId : maskSensitive(customer.taxId),
    }
  }

  function createCustomer(actor: CustomerActor, input: CustomerDraft): Customer {
    assertWrite(actor)
    assertCustomerDraft(input)
    if (input.status !== 'active' || input.frozenReason !== null) {
      throw new CustomerDomainError('INVALID_TRANSITION', '后台新增客户必须使用默认启用状态')
    }
    return repository.transact((state) => {
      validateReferences(state, input)
      let code = input.code?.trim() ?? ''
      if (input.codeMode === 'auto') {
        do { code = `CUS-${String(state.nextCustomerSequence).padStart(6, '0')}`; state.nextCustomerSequence += 1 }
        while (state.customers.some((customer) => sameCode(customer.code, code)))
      }
      if (state.customers.some((customer) => sameCode(customer.code, code))) throw new CustomerDomainError('DUPLICATE_CODE', '客户编码已存在')
      const timestamp = dependencies.now()
      const customer: Customer = {
        ...structuredClone(input), id: dependencies.nextId('customer'), enterpriseId: state.enterpriseId, code,
        createdAt: timestamp, updatedAt: timestamp,
      }
      delete (customer as Customer & { codeMode?: string }).codeMode
      state.customers.push(customer)
      appendLog(state, dependencies, customer.id, 'customer.created', `由 ${actor.actorId} 创建客户`)
      return customer
    })
  }

  function updateCustomer(actor: CustomerActor, id: EntityId, input: CustomerDraft): Customer {
    assertWrite(actor)
    assertCustomerDraft(input)
    return repository.transact((state) => {
      const current = findCustomer(state, id)
      validateReferences(state, input, current)
      if (input.status !== current.status || input.frozenReason !== current.frozenReason) throw new CustomerDomainError('INVALID_TRANSITION', '客户状态必须使用独立状态操作')
      if (actor.role !== 'super-admin' && (input.bankAccount !== current.bankAccount || input.taxId !== current.taxId)) {
        throw new CustomerDomainError('SENSITIVE_FIELD_FORBIDDEN', '当前角色不能修改银行账号或税号')
      }
      const code = input.codeMode === 'manual' ? input.code!.trim() : current.code
      if (state.customers.some((customer) => customer.id !== id && sameCode(customer.code, code))) throw new CustomerDomainError('DUPLICATE_CODE', '客户编码已存在')
      const updated: Customer = { ...structuredClone(input), id, enterpriseId: state.enterpriseId, code, createdAt: current.createdAt, updatedAt: dependencies.now() }
      delete (updated as Customer & { codeMode?: string }).codeMode
      state.customers[state.customers.indexOf(current)] = updated
      appendLog(state, dependencies, id, 'customer.updated', `由 ${actor.actorId} 更新客户资料`)
      return updated
    })
  }

  const allowedTransitions: Record<CustomerStatus, CustomerStatus[]> = {
    pending: ['active'], active: ['inactive', 'frozen'], inactive: ['active'], frozen: ['active'],
  }

  function changeCustomerStatus(actor: CustomerActor, id: EntityId, target: CustomerStatus, reason?: string): Customer {
    assertWrite(actor)
    return repository.transact((state) => {
      const customer = findCustomer(state, id)
      if (!allowedTransitions[customer.status].includes(target)) throw new CustomerDomainError('INVALID_TRANSITION', `不允许从${customer.status}变为${target}`)
      if (target === 'frozen' && !reason?.trim()) throw new CustomerDomainError('INVALID_TRANSITION', '冻结必须填写原因')
      const previous = customer.status
      customer.status = target
      customer.frozenReason = target === 'frozen' ? reason!.trim() : null
      customer.updatedAt = dependencies.now()
      appendLog(state, dependencies, id, 'customer.status-changed', `${previous} → ${target}`)
      return customer
    })
  }

  function createCategory(actor: CustomerActor, input: CustomerCategoryDraft): CustomerCategory {
    assertWrite(actor); assertCategoryDraft(input)
    return repository.transact((state) => {
      if (input.parentId) findCategory(state, input.parentId)
      if (state.categories.some((item) => sameCode(item.code, input.code))) throw new CustomerDomainError('DUPLICATE_CODE', '分类编码已存在')
      const timestamp = dependencies.now()
      const category = { ...structuredClone(input), id: dependencies.nextId('category'), enterpriseId: state.enterpriseId, createdAt: timestamp, updatedAt: timestamp }
      state.categories.push(category)
      return category
    })
  }

  function updateCategory(actor: CustomerActor, id: EntityId, input: CustomerCategoryDraft): CustomerCategory {
    assertWrite(actor); assertCategoryDraft(input)
    return repository.transact((state) => {
      const current = findCategory(state, id)
      if (state.categories.some((item) => item.id !== id && sameCode(item.code, input.code))) throw new CustomerDomainError('DUPLICATE_CODE', '分类编码已存在')
      if (input.parentId) {
        findCategory(state, input.parentId)
        if (descendantCategoryIds(state, id).has(input.parentId)) throw new CustomerDomainError('REFERENCE_CONFLICT', '上级分类不能选择自己或子分类')
      }
      const updated = { ...structuredClone(input), id, enterpriseId: state.enterpriseId, createdAt: current.createdAt, updatedAt: dependencies.now() }
      state.categories[state.categories.indexOf(current)] = updated
      return updated
    })
  }

  function deleteCategory(actor: CustomerActor, id: EntityId): void {
    assertWrite(actor)
    repository.transact((state) => {
      findCategory(state, id)
      if (state.categories.some((item) => item.parentId === id) || state.customers.some((item) => item.categoryId === id)) {
        throw new CustomerDomainError('REFERENCE_CONFLICT', '分类存在子级或客户引用，不能删除')
      }
      state.categories = state.categories.filter((item) => item.id !== id)
    })
  }

  function createTag(actor: CustomerActor, input: CustomerTagDraft): CustomerTag {
    assertWrite(actor); assertTagDraft(input)
    return repository.transact((state) => {
      if (state.tags.some((item) => sameCode(item.code, input.code))) throw new CustomerDomainError('DUPLICATE_CODE', '标签编码已存在')
      const timestamp = dependencies.now()
      const tag = { ...structuredClone(input), id: dependencies.nextId('tag'), enterpriseId: state.enterpriseId, createdAt: timestamp, updatedAt: timestamp }
      state.tags.push(tag)
      return tag
    })
  }

  function updateTag(actor: CustomerActor, id: EntityId, input: CustomerTagDraft): CustomerTag {
    assertWrite(actor); assertTagDraft(input)
    return repository.transact((state) => {
      const current = findTag(state, id)
      if (state.tags.some((item) => item.id !== id && sameCode(item.code, input.code))) throw new CustomerDomainError('DUPLICATE_CODE', '标签编码已存在')
      const referenced = state.customers.some((item) => item.tagIds.includes(id)) || state.suggestions.some((item) => item.tagId === id)
      if (referenced && input.type !== current.type) throw new CustomerDomainError('REFERENCE_CONFLICT', '已使用标签不能修改类型')
      const updated = { ...structuredClone(input), id, enterpriseId: state.enterpriseId, createdAt: current.createdAt, updatedAt: dependencies.now() }
      state.tags[state.tags.indexOf(current)] = updated
      return updated
    })
  }

  function deleteTag(actor: CustomerActor, id: EntityId): void {
    assertWrite(actor)
    repository.transact((state) => {
      findTag(state, id)
      const referenced = state.customers.some((item) => item.tagIds.includes(id)) || state.suggestions.some((item) => item.tagId === id && item.status === 'pending')
      if (referenced) throw new CustomerDomainError('REFERENCE_CONFLICT', '标签存在客户或待处理建议引用，不能删除')
      state.tags = state.tags.filter((item) => item.id !== id)
    })
  }

  function analyzeTags(actor: CustomerActor, input: ImmediateAnalysisInput): CustomerTagSuggestion[] {
    assertWrite(actor)
    return repository.transact((state) => {
      let customerIds: string[]
      if (input.scope === 'specified') customerIds = [...new Set(input.customerIds ?? [])]
      else if (input.scope === 'conditions') {
        const firstPage = listCustomers(actor, { ...input.conditions, page: 1, pageSize: 100 })
        if (firstPage.total > 1000) throw new CustomerDomainError('ANALYSIS_RANGE_INVALID', '立即分析客户数必须为 1～1000')
        customerIds = firstPage.items.map((item) => item.id)
        for (let page = 2; customerIds.length < firstPage.total; page += 1) {
          customerIds.push(...listCustomers(actor, { ...input.conditions, page, pageSize: 100 }).items.map((item) => item.id))
        }
      }
      else customerIds = state.customers.map((item) => item.id)
      if (!customerIds.length || customerIds.length > 1000) throw new CustomerDomainError('ANALYSIS_RANGE_INVALID', '立即分析客户数必须为 1～1000')
      customerIds.forEach((id) => findCustomer(state, id))
      const smartTag = state.tags.find((tag) => tag.type === 'smart' && tag.status === 'active')
      if (!smartTag) throw new CustomerDomainError('NOT_FOUND', '没有可用的智能标签')
      const created: CustomerTagSuggestion[] = []
      for (const customerId of customerIds) {
        const customer = findCustomer(state, customerId)
        const action = customer.tagIds.includes(smartTag.id) ? 'remove' : 'add'
        if (state.suggestions.some((item) => item.customerId === customerId && item.tagId === smartTag.id && item.action === action && item.status === 'pending')) continue
        const suggestion: CustomerTagSuggestion = { id: dependencies.nextId('suggestion'), enterpriseId: state.enterpriseId, customerId, tagId: smartTag.id, action, status: 'pending', createdAt: dependencies.now(), resolvedAt: null }
        state.suggestions.push(suggestion); created.push(suggestion)
      }
      return created
    })
  }

  function resolveSuggestions(actor: CustomerActor, ids: EntityId[], decision: 'confirm' | 'reject'): CustomerTagSuggestion[] {
    assertWrite(actor)
    return repository.transact((state) => {
      const uniqueIds = [...new Set(ids)]
      const suggestions = uniqueIds.map((id) => {
        const suggestion = state.suggestions.find((item) => item.id === id)
        if (!suggestion) throw new CustomerDomainError('NOT_FOUND', 'AI 标签建议不存在')
        if (suggestion.status !== 'pending') throw new CustomerDomainError('SUGGESTION_NOT_PENDING', 'AI 标签建议已经处理')
        return suggestion
      })
      for (const suggestion of suggestions) {
        if (decision === 'confirm') {
          const customer = findCustomer(state, suggestion.customerId)
          const tag = findTag(state, suggestion.tagId)
          if (suggestion.action === 'add') {
            if (tag.status !== 'active') throw new CustomerDomainError('INACTIVE_REFERENCE', '停用标签不能通过建议新增')
            if (!customer.tagIds.includes(tag.id)) customer.tagIds.push(tag.id)
          } else customer.tagIds = customer.tagIds.filter((id) => id !== tag.id)
          customer.updatedAt = dependencies.now()
          appendLog(state, dependencies, customer.id, 'customer.ai-tag-confirmed', `${suggestion.action}:${tag.code}`)
        }
        suggestion.status = decision === 'confirm' ? 'confirmed' : 'rejected'
        suggestion.resolvedAt = dependencies.now()
      }
      return suggestions
    })
  }

  return {
    listCustomers, getCustomer, createCustomer, updateCustomer, changeCustomerStatus,
    createCategory, updateCategory, deleteCategory, createTag, updateTag, deleteTag,
    analyzeTags, resolveSuggestions,
    listCategories: (actor: CustomerActor) => { assertRead(actor); return repository.read().categories.sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)) },
    listTags: (actor: CustomerActor) => { assertRead(actor); return repository.read().tags.sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)) },
    listSuggestions: (actor: CustomerActor) => { assertRead(actor); return repository.read().suggestions },
    listChangeLogs: (actor: CustomerActor, customerId: string) => { assertRead(actor); return repository.read().changeLogs.filter((item) => item.customerId === customerId) },
  }
}
