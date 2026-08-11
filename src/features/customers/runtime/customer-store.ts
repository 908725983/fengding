import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { createCustomerMockSession, type CustomerScenarioName } from '../../../../mock/handlers/customer-handler'
import { CustomerDomainError } from '../services/customer-service'
import type { CustomerActor, CustomerCategory, CustomerListItem, CustomerListQuery, CustomerTag, PageResult } from '../types'

export const useCustomerStore = defineStore('customers', () => {
  const scenario = ref<CustomerScenarioName>('normal')
  const actor = ref<CustomerActor>({ role: 'super-admin', actorId: 'admin-demo' })
  const query = ref<CustomerListQuery>({ page: 1, pageSize: 30 })
  const result = ref<PageResult<CustomerListItem>>({ items: [], total: 0, page: 1, pageSize: 30 })
  const categories = ref<CustomerCategory[]>([])
  const tags = ref<CustomerTag[]>([])
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

  return { scenario, actor, query, result, categories, tags, loading, error, isEmpty, load, setScenario, applyQuery, resetQuery, setPage }
})
