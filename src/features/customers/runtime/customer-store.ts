import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { createCustomerMockSession, type CustomerScenarioName } from '../../../../mock/handlers/customer-handler'
import { CustomerDomainError } from '../services/customer-service'
import { setCurrentCustomerRole } from './customer-access'
import type { Customer, CustomerActor, CustomerCategory, CustomerCategoryDraft, CustomerChangeLog, CustomerDraft, CustomerListItem, CustomerListQuery, CustomerStatus, CustomerTag, CustomerTagDraft, CustomerTagSuggestion, ImmediateAnalysisInput, PageResult } from '../types'

export const useCustomerStore = defineStore('customers', () => {
  const scenario = ref<CustomerScenarioName>('normal')
  const actor = ref<CustomerActor>({ role: 'super-admin', actorId: 'admin-demo' })
  const query = ref<CustomerListQuery>({ page: 1, pageSize: 30 })
  const result = ref<PageResult<CustomerListItem>>({ items: [], total: 0, page: 1, pageSize: 30 })
  const categories = ref<CustomerCategory[]>([])
  const tags = ref<CustomerTag[]>([])
  const selectedCustomer = ref<Customer | null>(null)
  const changeLogs = ref<CustomerChangeLog[]>([])
  const suggestions = ref<CustomerTagSuggestion[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  let session = createCustomerMockSession('normal')

  const isEmpty = computed(() => !loading.value && !error.value && result.value.total === 0)

  async function load(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const response = await session.run(() => ({
        page: session.service.listCustomers(actor.value, query.value),
        categories: session.service.listCategories(actor.value),
        tags: session.service.listTags(actor.value),
      }))
      result.value = response.page
      categories.value = response.categories
      tags.value = response.tags
    } catch (caught) {
      if (caught instanceof CustomerDomainError || caught instanceof Error) error.value = caught.message
      else error.value = '客户数据加载失败'
      result.value = { items: [], total: 0, page: query.value.page ?? 1, pageSize: query.value.pageSize ?? 30 }
    } finally {
      loading.value = false
    }
  }

  async function setScenario(next: CustomerScenarioName): Promise<void> {
    scenario.value = next
    actor.value = next === 'permission-denied'
      ? { role: 'warehouse', actorId: 'warehouse-demo' }
      : { role: 'super-admin', actorId: 'admin-demo' }
    setCurrentCustomerRole(actor.value.role)
    session = createCustomerMockSession(next)
    await load()
  }

  async function applyQuery(next: CustomerListQuery): Promise<void> {
    query.value = { ...next, page: 1, pageSize: next.pageSize ?? 30 }
    await load()
  }

  async function resetQuery(): Promise<void> {
    query.value = { page: 1, pageSize: 30 }
    await load()
  }

  async function setPage(page: number): Promise<void> {
    query.value = { ...query.value, page: Math.max(1, page) }
    await load()
  }

  async function loadCustomer(id: string): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const response = await session.run(() => ({
        customer: session.service.getCustomer(actor.value, id),
        logs: session.service.listChangeLogs(actor.value, id),
        categories: session.service.listCategories(actor.value),
        tags: session.service.listTags(actor.value),
      }))
      selectedCustomer.value = response.customer
      changeLogs.value = response.logs
      categories.value = response.categories
      tags.value = response.tags
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : '客户详情加载失败'
      selectedCustomer.value = null
      changeLogs.value = []
    } finally {
      loading.value = false
    }
  }

  async function createCustomer(input: CustomerDraft): Promise<Customer> {
    const created = await session.run(() => session.service.createCustomer(actor.value, input))
    selectedCustomer.value = created
    return created
  }

  async function updateCustomer(id: string, input: CustomerDraft): Promise<Customer> {
    const updated = await session.run(() => session.service.updateCustomer(actor.value, id, input))
    selectedCustomer.value = updated
    return updated
  }

  async function changeCustomerStatus(id: string, target: CustomerStatus, reason?: string): Promise<void> {
    await session.run(() => session.service.changeCustomerStatus(actor.value, id, target, reason))
    await loadCustomer(id)
  }

  async function loadManagement(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const response = await session.run(() => ({
        categories: session.service.listCategories(actor.value),
        tags: session.service.listTags(actor.value),
        suggestions: session.service.listSuggestions(actor.value),
        customers: session.service.listCustomers(actor.value, { page: 1, pageSize: 100 }),
      }))
      categories.value = response.categories
      tags.value = response.tags
      suggestions.value = response.suggestions
      result.value = response.customers
    } catch (caught) { error.value = caught instanceof Error ? caught.message : '客户管理资料加载失败' }
    finally { loading.value = false }
  }

  async function saveCategory(input: CustomerCategoryDraft, id?: string): Promise<void> {
    await session.run(() => id ? session.service.updateCategory(actor.value, id, input) : session.service.createCategory(actor.value, input))
    await loadManagement()
  }

  async function deleteCategory(id: string): Promise<void> {
    await session.run(() => session.service.deleteCategory(actor.value, id))
    await loadManagement()
  }

  async function saveTag(input: CustomerTagDraft, id?: string): Promise<void> {
    await session.run(() => id ? session.service.updateTag(actor.value, id, input) : session.service.createTag(actor.value, input))
    await loadManagement()
  }

  async function deleteTag(id: string): Promise<void> {
    await session.run(() => session.service.deleteTag(actor.value, id))
    await loadManagement()
  }

  async function analyzeTags(input: ImmediateAnalysisInput): Promise<void> {
    await session.run(() => session.service.analyzeTags(actor.value, input))
    await loadManagement()
  }

  async function resolveSuggestions(ids: string[], decision: 'confirm' | 'reject'): Promise<void> {
    await session.run(() => session.service.resolveSuggestions(actor.value, ids, decision))
    await loadManagement()
  }

  return {
    scenario, actor, query, result, categories, tags, selectedCustomer, changeLogs, suggestions, loading, error, isEmpty,
    load, setScenario, applyQuery, resetQuery, setPage, loadCustomer, createCustomer, updateCustomer, changeCustomerStatus,
    loadManagement, saveCategory, deleteCategory, saveTag, deleteTag, analyzeTags, resolveSuggestions,
  }
})
