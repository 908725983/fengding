import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { createProductMockSession, type ProductScenarioName } from '../../../../mock/handlers/product-handler'
import { setCurrentProductRole } from './product-access'
import type {
  PageResult,
  Product,
  ProductActor,
  ProductChangeLog,
  ProductDraft,
  ProductListItem,
  ProductListQuery,
  ProductImportResult,
  ProductReferenceData,
  ProductStatus,
} from '../types'

export type ProductRuntimeScenario = ProductScenarioName | 'partial-failure'

const emptyReferences = (): ProductReferenceData => ({
  categories: [], brands: [], units: [], tags: [], displayCategories: [], supplierProvider: 'unavailable', suppliers: [], freightTemplateProvider: 'unavailable',
})

export const useProductStore = defineStore('products', () => {
  const scenario = ref<ProductRuntimeScenario>('normal')
  const actor = ref<ProductActor>({ role: 'super-admin', actorId: 'admin-demo' })
  const query = ref<ProductListQuery>({ view: 'spu', page: 1, pageSize: 30 })
  const result = ref<PageResult<ProductListItem>>({ items: [], total: 0, page: 1, pageSize: 30 })
  const references = ref<ProductReferenceData>(emptyReferences())
  const selectedProduct = ref<Product | null>(null)
  const changeLogs = ref<ProductChangeLog[]>([])
  const loading = ref(false)
  const saving = ref(false)
  const error = ref<string | null>(null)
  const referenceError = ref<string | null>(null)
  let session = createProductMockSession('normal')

  const isEmpty = computed(() => !loading.value && !error.value && result.value.total === 0)
  const canWrite = computed(() => actor.value.role === 'super-admin')

  async function load(): Promise<void> {
    loading.value = true; error.value = null; referenceError.value = null
    try {
      const response = await session.run(() => ({ page: session.service.listProducts(actor.value, query.value), references: session.service.getReferenceData(actor.value) }))
      result.value = response.page
      references.value = response.references
      if (scenario.value === 'partial-failure') {
        references.value = { ...response.references, brands: [] }
        referenceError.value = '原型模拟：品牌资料加载失败，其他商品数据仍可使用'
      }
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : '商品数据加载失败'
      result.value = { items: [], total: 0, page: query.value.page ?? 1, pageSize: query.value.pageSize ?? 30 }
    } finally { loading.value = false }
  }

  async function setScenario(next: ProductRuntimeScenario): Promise<void> {
    scenario.value = next
    actor.value = next === 'permission-denied' ? { role: 'finance', actorId: 'finance-demo' } : { role: 'super-admin', actorId: 'admin-demo' }
    setCurrentProductRole(actor.value.role)
    session = createProductMockSession(next === 'partial-failure' ? 'normal' : next)
    await load()
  }

  async function applyQuery(next: ProductListQuery): Promise<void> {
    query.value = { ...next, view: next.view ?? query.value.view ?? 'spu', page: 1, pageSize: next.pageSize ?? 30 }
    await load()
  }

  async function setView(view: 'spu' | 'sku'): Promise<void> { await applyQuery({ ...query.value, view }) }
  async function resetQuery(): Promise<void> { query.value = { view: 'spu', page: 1, pageSize: 30 }; await load() }
  async function setPage(page: number): Promise<void> { query.value = { ...query.value, page: Math.max(1, page) }; await load() }

  async function loadProduct(id: string): Promise<void> {
    loading.value = true; error.value = null
    try {
      const response = await session.run(() => ({
        product: session.service.getProduct(actor.value, id), logs: session.service.listChangeLogs(actor.value, id), references: session.service.getReferenceData(actor.value),
      }))
      selectedProduct.value = response.product; changeLogs.value = response.logs; references.value = response.references
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : '商品详情加载失败'; selectedProduct.value = null; changeLogs.value = []
    } finally { loading.value = false }
  }

  async function createProduct(input: ProductDraft): Promise<Product> {
    saving.value = true
    try { const product = await session.run(() => session.service.createProduct(actor.value, input)); selectedProduct.value = product; return product }
    finally { saving.value = false }
  }

  async function updateProduct(id: string, input: ProductDraft): Promise<Product> {
    saving.value = true
    try { const product = await session.run(() => session.service.updateProduct(actor.value, id, input)); selectedProduct.value = product; return product }
    finally { saving.value = false }
  }

  async function changeStatus(id: string, target: ProductStatus): Promise<void> { await session.run(() => session.service.changeProductStatus(actor.value, id, target)); await loadProduct(id) }
  async function deleteProduct(id: string): Promise<void> { await session.run(() => session.service.deleteProduct(actor.value, id)); await load() }
  async function batchChangeStatus(ids: string[], target: ProductStatus): Promise<void> { await session.run(() => session.service.batchChangeStatus(actor.value, ids, target)); await load() }
  async function importProducts(drafts: ProductDraft[]): Promise<ProductImportResult> {
    saving.value = true
    const payload = JSON.parse(JSON.stringify(drafts)) as ProductDraft[]
    try { const imported = await session.run(() => session.service.importProducts(actor.value, payload)); await load(); return imported }
    finally { saving.value = false }
  }
  function exportCsv(selectedIds: string[]): string { return session.service.exportProductsCsv(actor.value, query.value, selectedIds) }

  return {
    scenario, actor, query, result, references, selectedProduct, changeLogs, loading, saving, error, referenceError, isEmpty, canWrite,
    load, setScenario, applyQuery, setView, resetQuery, setPage, loadProduct, createProduct, updateProduct, changeStatus, deleteProduct,
    batchChangeStatus, importProducts, exportCsv,
  }
})
