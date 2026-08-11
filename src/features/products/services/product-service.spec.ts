import { beforeEach, describe, expect, it } from 'vitest'
import { productBaseline } from '../../../../mock/handlers/product-handler'
import { InMemoryProductRepository } from '../repositories/product-repository'
import type { ProductActor, ProductDraft } from '../types'
import {
  ProductDomainError,
  applyBaseUnit,
  convertPriceForUnit,
  convertQuantityToBase,
  createEmptyProductDraft,
  createProductService,
} from './product-service'

const admin: ProductActor = { role: 'super-admin', actorId: 'admin-demo' }
const salesperson: ProductActor = { role: 'salesperson', actorId: 'sales-demo' }
const warehouse: ProductActor = { role: 'warehouse', actorId: 'warehouse-demo' }
const finance: ProductActor = { role: 'finance', actorId: 'finance-demo' }

function validDraft(name = '演示新增商品'): ProductDraft {
  const draft = applyBaseUnit(createEmptyProductDraft(), 'unit-piece')
  draft.name = name
  draft.categoryId = 'product-category-food'
  draft.brandId = 'brand-demo'
  draft.tagIds = ['product-tag-featured']
  draft.displayCategoryId = 'display-category-demo'
  draft.skus[0]!.basePurchasePriceCents = 500
  draft.skus[0]!.baseOrderPriceCents = 800
  draft.skus[0]!.minimumSalePriceCents = 700
  draft.skus[0]!.maximumSalePriceCents = 1000
  return draft
}

describe('PRD-001 product service', () => {
  let repository: InMemoryProductRepository
  let sequence: number
  let service: ReturnType<typeof createProductService>

  beforeEach(() => {
    repository = new InMemoryProductRepository(productBaseline)
    sequence = 1
    service = createProductService({
      repository,
      now: () => '2026-08-11T15:00:00+08:00',
      nextId: (kind) => `${kind}-generated-${sequence++}`,
    })
  })

  it('creates draft products with deterministic non-reused SPU and SKU codes', () => {
    const created = service.createProduct(admin, validDraft())
    expect(created).toMatchObject({ code: 'SPU-000004', status: 'draft' })
    expect(created.skus[0]?.code).toBe('SKU-000005')
    expect(repository.read()).toMatchObject({ nextProductSequence: 5, nextSkuSequence: 6 })
    expect(service.listChangeLogs(admin, created.id)[0]?.action).toBe('product.created')
  })

  it('atomically rejects duplicate SPU codes, SKU codes and barcodes (PRD-01/PRD-12)', () => {
    const before = repository.read()
    const duplicateSpu = { ...validDraft(), codeMode: 'manual' as const, code: 'spu-000001' }
    expect(() => service.createProduct(admin, duplicateSpu)).toThrowError(expect.objectContaining({ code: 'DUPLICATE_CODE' }))
    expect(repository.read()).toEqual(before)

    const duplicateSku = validDraft()
    duplicateSku.skus[0] = { ...duplicateSku.skus[0]!, codeMode: 'manual', code: 'sku-000002' }
    expect(() => service.createProduct(admin, duplicateSku)).toThrowError(expect.objectContaining({ code: 'DUPLICATE_CODE' }))

    const duplicateBarcode = validDraft()
    duplicateBarcode.skus[0] = { ...duplicateBarcode.skus[0]!, barcode: 'demo-bar-0003' }
    expect(() => service.createProduct(admin, duplicateBarcode)).toThrowError(expect.objectContaining({ code: 'DUPLICATE_BARCODE' }))
  })

  it('lists SPUs and SKUs with descendant, any-tag, keyword and base-order-price filters', () => {
    expect(service.listProducts(admin, { categoryId: 'product-category-food' }).total).toBe(3)
    expect(service.listProducts(admin, { categoryId: 'product-category-drink' }).items.map((row) => row.productId)).toEqual(['product-2'])
    expect(service.listProducts(admin, { tagIds: ['missing', 'product-tag-featured'] }).items.map((row) => row.productId)).toEqual(['product-1'])
    const skuRows = service.listProducts(admin, { view: 'sku', keyword: '500ml', priceMinCents: 700 })
    expect(skuRows.items.map((row) => row.code)).toEqual(['SKU-000003'])
    const productTwo = service.listProducts(admin).items.find((row) => row.productId === 'product-2')
    expect(productTwo).toMatchObject({ skuCount: 2, baseOrderPriceMinCents: 500, baseOrderPriceMaxCents: 800 })
  })

  it('uses route/UI/service-compatible permissions and refuses unavailable supplier filtering', () => {
    expect(service.listProducts(salesperson).total).toBe(3)
    expect(service.getProduct(warehouse, 'product-1').id).toBe('product-1')
    expect(() => service.listProducts(finance)).toThrowError(expect.objectContaining({ code: 'PERMISSION_DENIED' }))
    expect(() => service.createProduct(salesperson, validDraft())).toThrowError(expect.objectContaining({ code: 'PERMISSION_DENIED' }))
    expect(() => service.exportProductsCsv(salesperson)).toThrowError(expect.objectContaining({ code: 'PERMISSION_DENIED' }))
    expect(() => service.listProducts(admin, { supplierId: 'supplier-demo' })).toThrowError(expect.objectContaining({ code: 'DATA_PROVIDER_UNAVAILABLE' }))
  })

  it('rejects inactive references for new assignments but preserves deterministic reference providers', () => {
    const draft = validDraft()
    draft.categoryId = 'product-category-inactive'
    expect(() => service.createProduct(admin, draft)).toThrowError(expect.objectContaining({ code: 'INACTIVE_REFERENCE' }))
    expect(service.getReferenceData(admin)).toMatchObject({ supplierProvider: 'unavailable', freightTemplateProvider: 'unavailable' })
  })

  it('enforces confirmed price bounds while leaving purchase price outside sale limits (PRD-13)', () => {
    const draft = validDraft()
    draft.skus[0]!.basePurchasePriceCents = 2000
    expect(() => service.createProduct(admin, draft)).not.toThrow()
    const invalid = validDraft('演示越界商品')
    invalid.skus[0]!.tierOnePriceCents = 699
    expect(() => service.createProduct(admin, invalid)).toThrowError(expect.objectContaining({ code: 'PRODUCT_VALIDATION_FAILED' }))
  })

  it('uses the confirmed status machine and orderable provider (PRD-05)', () => {
    expect(service.listOrderableProducts().map((item) => item.id)).toEqual(['product-1'])
    expect(service.changeProductStatus(admin, 'product-3', 'on-sale').status).toBe('on-sale')
    expect(service.listOrderableProducts().map((item) => item.id)).toEqual(['product-1', 'product-3'])
    expect(service.changeProductStatus(admin, 'product-1', 'off-sale').status).toBe('off-sale')
    expect(service.listOrderableProducts().map((item) => item.id)).toEqual(['product-3'])
    expect(() => service.changeProductStatus(admin, 'product-2', 'draft')).toThrowError(expect.objectContaining({ code: 'INVALID_TRANSITION' }))
  })

  it('protects referenced products and mark-deletes eligible products without code reuse (PRD-08)', () => {
    service.changeProductStatus(admin, 'product-1', 'off-sale')
    expect(() => service.deleteProduct(admin, 'product-1')).toThrowError(expect.objectContaining({ code: 'REFERENCE_CONFLICT' }))
    service.deleteProduct(admin, 'product-3')
    expect(service.listProducts(admin).items.some((row) => row.productId === 'product-3')).toBe(false)
    const duplicate = { ...validDraft(), codeMode: 'manual' as const, code: 'SPU-000003' }
    expect(() => service.createProduct(admin, duplicate)).toThrowError(expect.objectContaining({ code: 'DUPLICATE_CODE' }))
  })

  it('prevalidates batch transitions and rolls the whole transaction back', () => {
    const before = repository.read()
    expect(() => service.batchChangeStatus(admin, ['product-1', 'product-3'], 'off-sale')).toThrowError(ProductDomainError)
    expect(repository.read()).toEqual(before)
    expect(service.batchChangeStatus(admin, ['product-2'], 'on-sale').map((item) => item.status)).toEqual(['on-sale'])
  })

  it('uses confirmed unit precision and half-up cent conversion (PRD-06)', () => {
    expect(convertQuantityToBase(1.2345, 12)).toBe(14.814)
    expect(convertPriceForUnit(333, 1.5)).toBe(500)
    const product = service.getProduct(admin, 'product-2')
    expect(product.sceneUnits.procurement).toEqual({ unitId: 'unit-box', conversionRate: 12 })
  })

  it('imports atomically and exports selected/current-filter SKU rows through the fake contract', () => {
    const first = { ...validDraft('演示导入甲'), codeMode: 'manual' as const, code: 'IMPORT-SPU' }
    const second = { ...validDraft('演示导入乙'), codeMode: 'manual' as const, code: 'IMPORT-SPU' }
    const before = repository.read()
    expect(() => service.importProducts(admin, [first, second])).toThrowError(expect.objectContaining({ code: 'DUPLICATE_CODE' }))
    expect(repository.read()).toEqual(before)
    const csv = service.exportProductsCsv(admin, { status: 'on-sale' }, ['product-1'])
    expect(csv).toContain('SKU-000001')
    expect(csv).not.toContain('SKU-000002')
    expect(csv).not.toContain('明显虚构的演示商品')
  })
})
