import { assertProductDraft } from '../schemas/product-schema'
import type { ProductRepository } from '../repositories/product-repository'
import type {
  EntityId,
  PageResult,
  Product,
  ProductActor,
  ProductDraft,
  ProductFeatureState,
  ProductImportResult,
  ProductListItem,
  ProductListQuery,
  ProductReferenceData,
  ProductSku,
  ProductSkuDraft,
  ProductStatus,
  RichTextDocument,
} from '../types'

export type ProductDomainErrorCode =
  | 'PERMISSION_DENIED'
  | 'NOT_FOUND'
  | 'DUPLICATE_CODE'
  | 'DUPLICATE_BARCODE'
  | 'INACTIVE_REFERENCE'
  | 'INVALID_TRANSITION'
  | 'REFERENCE_CONFLICT'
  | 'DATA_PROVIDER_UNAVAILABLE'

export class ProductDomainError extends Error {
  constructor(readonly code: ProductDomainErrorCode, message: string) {
    super(message)
    this.name = 'ProductDomainError'
  }
}

export interface ProductServiceDependencies {
  repository: ProductRepository
  now: () => string
  nextId: (kind: 'product' | 'sku' | 'log') => string
  supplierProvider?: { listEffectiveSkuIds(supplierId: EntityId): EntityId[]; listEnabledSuppliers(): Array<{ id: EntityId; name: string }> }
}

const readableRoles = new Set(['super-admin', 'sales-supervisor', 'salesperson', 'warehouse'])
const writableRoles = new Set(['super-admin'])

function assertRead(actor: ProductActor): void {
  if (!readableRoles.has(actor.role)) throw new ProductDomainError('PERMISSION_DENIED', '当前角色不可访问商品模块')
}

function assertWrite(actor: ProductActor): void {
  if (!writableRoles.has(actor.role)) throw new ProductDomainError('PERMISSION_DENIED', '当前角色不可修改商品资料')
}

function normalize(value: string): string { return value.trim().toLocaleLowerCase() }

function findProduct(state: ProductFeatureState, id: EntityId): Product {
  const product = state.products.find((item) => item.id === id && item.deletedAt === null)
  if (!product) throw new ProductDomainError('NOT_FOUND', '商品不存在')
  return product
}

function descendants(state: ProductFeatureState, rootId: EntityId): Set<EntityId> {
  const result = new Set([rootId])
  let changed = true
  while (changed) {
    changed = false
    for (const category of state.categories) {
      if (category.parentId && result.has(category.parentId) && !result.has(category.id)) {
        result.add(category.id); changed = true
      }
    }
  }
  return result
}

function priceRange(values: Array<number | null>): [number | null, number | null] {
  const present = values.filter((value): value is number => value !== null)
  return present.length ? [Math.min(...present), Math.max(...present)] : [null, null]
}

function appendLog(state: ProductFeatureState, dependencies: ProductServiceDependencies, productId: string, action: ProductFeatureState['changeLogs'][number]['action'], detail: string): void {
  state.changeLogs.push({
    id: dependencies.nextId('log'), enterpriseId: state.enterpriseId, productId, action, detail, createdAt: dependencies.now(),
  })
}

export function emptyRichText(): RichTextDocument {
  return { version: 1, blocks: [] }
}

export function createEmptySkuDraft(): ProductSkuDraft {
  return {
    codeMode: 'auto', code: null, shortName: null, barcode: null, specificationName: '默认', specificationValue: '默认规格', mainImage: null,
    basePurchasePriceCents: null, baseOrderPriceCents: null, minimumSalePriceCents: null, maximumSalePriceCents: null,
    tierOnePriceCents: null, tierTwoPriceCents: null, storePriceCents: null, terminalPriceCents: null,
  }
}

export function createEmptyProductDraft(): ProductDraft {
  const blankScene = { unitId: '', conversionRate: 1 }
  return {
    codeMode: 'auto', code: null, name: '', shortName: null, categoryId: '', baseUnitId: '', productType: 'normal', displayCategoryId: null,
    brandId: null, tagIds: [], sceneUnits: { inventory: { ...blankScene }, procurement: { ...blankScene }, distribution: { ...blankScene }, sales: { ...blankScene } },
    weightKg: null, origin: null, shelfLifeDays: null, minimumOrderQuantity: null, orderMultiple: 1, salesTaxRatePercent: null,
    manageProductionDate: false, freeShipping: false, freightTemplateId: null, freightUnitId: '', carouselImages: [],
    customAttributes: { color: null, grossWeight: null, netWeight: null, grossUnitPrice: null, netUnitPrice: null, supplier: null },
    description: emptyRichText(), skus: [createEmptySkuDraft()],
  }
}

export function applyBaseUnit(draft: ProductDraft, unitId: EntityId): ProductDraft {
  const currentBase = draft.baseUnitId
  const replace = (value: { unitId: string; conversionRate: number }) => currentBase === '' || value.unitId === '' || value.unitId === currentBase ? { unitId, conversionRate: 1 } : { ...value }
  return {
    ...structuredClone(draft), baseUnitId: unitId,
    sceneUnits: {
      inventory: replace(draft.sceneUnits.inventory), procurement: replace(draft.sceneUnits.procurement),
      distribution: replace(draft.sceneUnits.distribution), sales: replace(draft.sceneUnits.sales),
    },
    freightUnitId: !draft.freightUnitId || draft.freightUnitId === currentBase ? unitId : draft.freightUnitId,
  }
}

export function convertQuantityToBase(quantity: number, conversionRate: number): number {
  return Math.round(quantity * conversionRate * 1000) / 1000
}

export function convertPriceForUnit(priceCents: number, conversionRate: number): number {
  return Math.round(priceCents * conversionRate)
}

export function createProductService(dependencies: ProductServiceDependencies) {
  const { repository } = dependencies

  function assertReference(state: ProductFeatureState, collection: 'categories' | 'brands' | 'units' | 'tags' | 'displayCategories', id: string, previousIds: Set<string> = new Set()): void {
    const reference = state[collection].find((item) => item.id === id)
    if (!reference) throw new ProductDomainError('NOT_FOUND', '商品辅助资料不存在')
    if (reference.status !== 'active' && !previousIds.has(id)) throw new ProductDomainError('INACTIVE_REFERENCE', '停用的商品辅助资料不能新选择')
  }

  function validateReferences(state: ProductFeatureState, draft: ProductDraft, previous?: Product): void {
    const previousIds = new Set(previous ? [previous.categoryId, previous.baseUnitId, previous.freightUnitId, previous.brandId, previous.displayCategoryId, ...previous.tagIds, ...Object.values(previous.sceneUnits).map((item) => item.unitId)].filter((id): id is string => Boolean(id)) : [])
    assertReference(state, 'categories', draft.categoryId, previousIds)
    assertReference(state, 'units', draft.baseUnitId, previousIds)
    assertReference(state, 'units', draft.freightUnitId, previousIds)
    for (const scene of Object.values(draft.sceneUnits)) assertReference(state, 'units', scene.unitId, previousIds)
    if (draft.brandId) assertReference(state, 'brands', draft.brandId, previousIds)
    if (draft.displayCategoryId) assertReference(state, 'displayCategories', draft.displayCategoryId, previousIds)
    for (const tagId of draft.tagIds) assertReference(state, 'tags', tagId, previousIds)
  }

  function nextUniqueProductCode(state: ProductFeatureState): string {
    let code: string
    do { code = `SPU-${String(state.nextProductSequence).padStart(6, '0')}`; state.nextProductSequence += 1 }
    while (state.products.some((item) => normalize(item.code) === normalize(code)))
    return code
  }

  function nextUniqueSkuCode(state: ProductFeatureState): string {
    let code: string
    do { code = `SKU-${String(state.nextSkuSequence).padStart(6, '0')}`; state.nextSkuSequence += 1 }
    while (state.products.some((item) => item.skus.some((sku) => normalize(sku.code) === normalize(code))))
    return code
  }

  function materializeSkus(state: ProductFeatureState, productId: string, drafts: ProductSkuDraft[], previous?: Product): ProductSku[] {
    const assigned: ProductSku[] = []
    for (const draft of drafts) {
      const code = draft.codeMode === 'auto' ? nextUniqueSkuCode(state) : draft.code!.trim()
      const duplicate = state.products.some((product) => product.skus.some((sku) => normalize(sku.code) === normalize(code) && (!previous || sku.productId !== previous.id)))
        || assigned.some((sku) => normalize(sku.code) === normalize(code))
      if (duplicate) throw new ProductDomainError('DUPLICATE_CODE', `SKU 编码 ${code} 已存在`)
      const barcode = draft.barcode?.trim() || null
      if (barcode) {
        const barcodeDuplicate = state.products.some((product) => product.skus.some((sku) => normalize(sku.barcode ?? '') === normalize(barcode) && (!previous || sku.productId !== previous.id)))
          || assigned.some((sku) => normalize(sku.barcode ?? '') === normalize(barcode))
        if (barcodeDuplicate) throw new ProductDomainError('DUPLICATE_BARCODE', `SKU 条码 ${barcode} 已存在`)
      }
      const previousSku = previous?.skus.find((sku) => normalize(sku.code) === normalize(code))
      const { codeMode: _mode, ...fields } = structuredClone(draft)
      assigned.push({ ...fields, id: previousSku?.id ?? dependencies.nextId('sku'), enterpriseId: state.enterpriseId, productId, code, barcode })
    }
    return assigned
  }

  function materializeProduct(state: ProductFeatureState, actor: ProductActor, input: ProductDraft, previous?: Product, action: 'product.created' | 'product.imported' = 'product.created'): Product {
    assertProductDraft(input)
    validateReferences(state, input, previous)
    const code = previous && input.codeMode === 'auto' ? previous.code : input.codeMode === 'auto' ? nextUniqueProductCode(state) : input.code!.trim()
    if (state.products.some((item) => item.id !== previous?.id && normalize(item.code) === normalize(code))) throw new ProductDomainError('DUPLICATE_CODE', `SPU 编码 ${code} 已存在`)
    const timestamp = dependencies.now()
    const id = previous?.id ?? dependencies.nextId('product')
    const { codeMode: _mode, skus: skuDrafts, ...fields } = structuredClone(input)
    const product: Product = {
      ...fields, id, enterpriseId: state.enterpriseId, code, skus: materializeSkus(state, id, skuDrafts, previous),
      status: previous?.status ?? 'draft', hasOrderReference: previous?.hasOrderReference ?? false, deletedAt: null,
      createdAt: previous?.createdAt ?? timestamp, updatedAt: timestamp,
    }
    if (previous) state.products[state.products.indexOf(previous)] = product
    else state.products.push(product)
    appendLog(state, dependencies, id, previous ? 'product.updated' : action, `由 ${actor.actorId} ${previous ? '更新' : action === 'product.imported' ? '导入' : '创建'}商品`)
    return product
  }

  function listProducts(actor: ProductActor, query: ProductListQuery = {}): PageResult<ProductListItem> {
    assertRead(actor)
    const supplierSkuIds = query.supplierId ? new Set(dependencies.supplierProvider?.listEffectiveSkuIds(query.supplierId) ?? []) : null
    if (query.supplierId && !dependencies.supplierProvider) throw new ProductDomainError('DATA_PROVIDER_UNAVAILABLE', '供应商关系尚未接入')
    const state = repository.read()
    const view = query.view ?? 'spu'
    const categoryScope = query.categoryId ? descendants(state, query.categoryId) : null
    const keyword = query.keyword?.trim().toLocaleLowerCase()
    const rows: ProductListItem[] = []
    for (const product of state.products.filter((item) => item.deletedAt === null)) {
      if (categoryScope && !categoryScope.has(product.categoryId)) continue
      if (query.brandId && product.brandId !== query.brandId) continue
      if (query.status && product.status !== query.status) continue
      if (query.tagIds?.length && !query.tagIds.some((id) => product.tagIds.includes(id))) continue
      const productKeywordMatch = keyword ? [product.name, product.code].some((value) => normalize(value).includes(keyword)) : true
      const matchingSkus = product.skus.filter((sku) => {
        if (supplierSkuIds && !supplierSkuIds.has(sku.id)) return false
        const keywordMatch = !keyword || productKeywordMatch || [sku.code, sku.barcode ?? '', sku.specificationName, sku.specificationValue].some((value) => normalize(value).includes(keyword))
        const price = sku.baseOrderPriceCents
        const priceMatch = (query.priceMinCents === undefined || (price !== null && price >= query.priceMinCents))
          && (query.priceMaxCents === undefined || (price !== null && price <= query.priceMaxCents))
        return keywordMatch && priceMatch
      })
      if (!matchingSkus.length) continue
      const unitName = state.units.find((item) => item.id === product.baseUnitId)?.name ?? '未知单位'
      if (view === 'sku') {
        for (const sku of matchingSkus) {
          rows.push({
            rowId: sku.id, productId: product.id, skuId: sku.id, view, name: product.name,
            specification: `${sku.specificationName}：${sku.specificationValue}`, code: sku.code, barcode: sku.barcode, skuCount: 1,
            image: sku.mainImage, unitName, basePurchasePriceMinCents: sku.basePurchasePriceCents, basePurchasePriceMaxCents: sku.basePurchasePriceCents,
            baseOrderPriceMinCents: sku.baseOrderPriceCents, baseOrderPriceMaxCents: sku.baseOrderPriceCents,
            status: product.status, createdAt: product.createdAt,
          })
        }
      } else {
        const [purchaseMin, purchaseMax] = priceRange(matchingSkus.map((sku) => sku.basePurchasePriceCents))
        const [orderMin, orderMax] = priceRange(matchingSkus.map((sku) => sku.baseOrderPriceCents))
        rows.push({
          rowId: product.id, productId: product.id, skuId: null, view, name: product.name, specification: null, code: product.code, barcode: null,
          skuCount: product.skus.length, image: product.skus.find((sku) => sku.mainImage)?.mainImage ?? null, unitName,
          basePurchasePriceMinCents: purchaseMin, basePurchasePriceMaxCents: purchaseMax,
          baseOrderPriceMinCents: orderMin, baseOrderPriceMaxCents: orderMax,
          status: product.status, createdAt: product.createdAt,
        })
      }
    }
    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.rowId.localeCompare(a.rowId))
    const page = Math.max(1, query.page ?? 1)
    const pageSize = query.pageSize ?? 30
    const start = (page - 1) * pageSize
    return { items: rows.slice(start, start + pageSize), total: rows.length, page, pageSize }
  }

  function getProduct(actor: ProductActor, id: EntityId): Product {
    assertRead(actor)
    return findProduct(repository.read(), id)
  }

  function createProduct(actor: ProductActor, input: ProductDraft): Product {
    assertWrite(actor)
    return repository.transact((state) => materializeProduct(state, actor, input))
  }

  function updateProduct(actor: ProductActor, id: EntityId, input: ProductDraft): Product {
    assertWrite(actor)
    return repository.transact((state) => materializeProduct(state, actor, input, findProduct(state, id)))
  }

  const transitions: Record<ProductStatus, ProductStatus[]> = { draft: ['on-sale'], 'on-sale': ['off-sale'], 'off-sale': ['on-sale'] }

  function changeProductStatus(actor: ProductActor, id: EntityId, target: ProductStatus): Product {
    assertWrite(actor)
    return repository.transact((state) => {
      const product = findProduct(state, id)
      if (!transitions[product.status].includes(target)) throw new ProductDomainError('INVALID_TRANSITION', `不允许从 ${product.status} 变为 ${target}`)
      const previous = product.status
      product.status = target; product.updatedAt = dependencies.now()
      appendLog(state, dependencies, id, 'product.status-changed', `${previous} → ${target}`)
      return product
    })
  }

  function batchChangeStatus(actor: ProductActor, ids: EntityId[], target: ProductStatus): Product[] {
    assertWrite(actor)
    return repository.transact((state) => {
      const products = [...new Set(ids)].map((id) => findProduct(state, id))
      if (products.some((product) => !transitions[product.status].includes(target))) throw new ProductDomainError('INVALID_TRANSITION', '批量状态操作包含不合法商品，已整体拒绝')
      for (const product of products) {
        const previous = product.status; product.status = target; product.updatedAt = dependencies.now()
        appendLog(state, dependencies, product.id, 'product.status-changed', `${previous} → ${target}`)
      }
      return products
    })
  }

  function deleteProduct(actor: ProductActor, id: EntityId): void {
    assertWrite(actor)
    repository.transact((state) => {
      const product = findProduct(state, id)
      if (product.status === 'on-sale') throw new ProductDomainError('INVALID_TRANSITION', '上架商品必须先下架')
      if (product.hasOrderReference) throw new ProductDomainError('REFERENCE_CONFLICT', '商品已有订单引用，只能下架')
      product.deletedAt = dependencies.now(); product.updatedAt = product.deletedAt
      appendLog(state, dependencies, id, 'product.deleted', `由 ${actor.actorId} 标记删除商品`)
    })
  }

  function importProducts(actor: ProductActor, drafts: ProductDraft[]): ProductImportResult {
    assertWrite(actor)
    drafts.forEach(assertProductDraft)
    return repository.transact((state) => {
      const created = drafts.map((draft) => materializeProduct(state, actor, draft, undefined, 'product.imported'))
      return { createdIds: created.map((item) => item.id), count: created.length }
    })
  }

  function exportProductsCsv(actor: ProductActor, query: ProductListQuery = {}, selectedProductIds: EntityId[] = []): string {
    assertWrite(actor)
    const selected = new Set(selectedProductIds)
    const rows = listProducts(actor, { ...query, view: 'sku', page: 1, pageSize: 100 })
    const all = [...rows.items]
    for (let page = 2; all.length < rows.total; page += 1) all.push(...listProducts(actor, { ...query, view: 'sku', page, pageSize: 100 }).items)
    const scoped = selected.size ? all.filter((row) => selected.has(row.productId)) : all
    const escape = (value: string | number | null) => `"${String(value ?? '').replaceAll('"', '""')}"`
    return [
      ['SPU名称', 'SKU编码', '规格', '条码', '基本单位', '基准进货价(分)', '基准订货价(分)', '状态'].map(escape).join(','),
      ...scoped.map((row) => [row.name, row.code, row.specification, row.barcode, row.unitName, row.basePurchasePriceMinCents, row.baseOrderPriceMinCents, row.status].map(escape).join(',')),
    ].join('\r\n')
  }

  function getReferenceData(actor: ProductActor): ProductReferenceData {
    assertRead(actor)
    const state = repository.read()
    return {
      categories: state.categories, brands: state.brands, units: state.units, tags: state.tags, displayCategories: state.displayCategories,
      supplierProvider: dependencies.supplierProvider ? 'available' : 'unavailable', suppliers: dependencies.supplierProvider?.listEnabledSuppliers() ?? [], freightTemplateProvider: 'unavailable',
    }
  }

  function listOrderableProducts(): Product[] {
    return repository.read().products.filter((product) => product.deletedAt === null && product.status === 'on-sale')
  }

  return {
    listProducts, getProduct, createProduct, updateProduct, changeProductStatus, batchChangeStatus, deleteProduct,
    importProducts, exportProductsCsv, getReferenceData, listOrderableProducts,
    listChangeLogs: (actor: ProductActor, productId: EntityId) => { assertRead(actor); return repository.read().changeLogs.filter((item) => item.productId === productId) },
  }
}
