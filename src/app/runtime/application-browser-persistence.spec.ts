import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApplicationMockRuntime } from '../../../mock/runtime/application-mock-runtime'
import {
  exportApplicationData,
  importApplicationData,
  parseApplicationDataPackage,
} from '../../../mock/runtime/application-browser-persistence'
import { applyBaseUnit, createEmptyProductDraft } from '../../features/products/services/product-service'

const admin = { actorId: 'admin-test', role: 'super-admin' as const }

function createListedProduct(runtime: ReturnType<typeof createApplicationMockRuntime>, name: string) {
  const draft = applyBaseUnit(createEmptyProductDraft(), 'unit-piece')
  draft.name = name
  draft.categoryId = 'product-category-drink'
  draft.skus[0]!.basePurchasePriceCents = 300
  draft.skus[0]!.baseOrderPriceCents = 500
  draft.skus[0]!.minimumSalePriceCents = 400
  draft.skus[0]!.maximumSalePriceCents = 700
  const product = runtime.product.service.createProduct(admin, draft)
  return runtime.product.service.changeProductStatus(admin, product.id, 'on-sale')
}

afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
})

describe('application browser persistence', () => {
  it('exports and restores all validated runtime domains atomically', () => {
    const runtime = createApplicationMockRuntime()
    runtime.customer.repository.transact((state) => { state.customers[0]!.name = '导出客户' })
    runtime.procurement.repository.transact((state) => { state.suppliers[0]!.name = '导出供应商' })
    const exported = exportApplicationData(runtime)

    runtime.customer.repository.transact((state) => { state.customers[0]!.name = '后来修改的客户' })
    runtime.procurement.repository.transact((state) => { state.suppliers[0]!.name = '后来修改的供应商' })
    importApplicationData(runtime, exported)

    expect(runtime.customer.repository.read().customers[0]!.name).toBe('导出客户')
    expect(runtime.procurement.repository.read().suppliers[0]!.name).toBe('导出供应商')

    const invalid = JSON.parse(exported) as Record<string, any>
    invalid.domains.customer.customers[0].name = '不应部分导入'
    invalid.domains.product.schemaVersion = 999
    expect(() => importApplicationData(runtime, invalid)).toThrow('数据包校验失败')
    expect(runtime.customer.repository.read().customers[0]!.name).toBe('导出客户')
  })

  it('rejects files that are not Fengding data packages', () => {
    expect(() => parseApplicationDataPackage('not-json')).toThrow('不是有效的 JSON')
    expect(() => parseApplicationDataPackage('{}')).toThrow('请选择由蜂订原型导出的数据包')
  })

  it('keeps jsdom imports in memory when browser persistence is intentionally disabled', () => {
    const source = createApplicationMockRuntime()
    source.customer.repository.transact((state) => { state.customers[0]!.name = '纯内存导入客户' })
    const target = createApplicationMockRuntime()

    importApplicationData(target, exportApplicationData(source))

    expect(target.customer.repository.read().customers[0]!.name).toBe('纯内存导入客户')
  })

  it('rejects a production-browser import when local storage is unavailable', () => {
    const source = createApplicationMockRuntime()
    source.customer.repository.transact((state) => { state.customers[0]!.name = '不应导入的客户' })
    const exported = exportApplicationData(source)

    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 Chrome/140.0')
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('Access denied', 'SecurityError')
    })
    const target = createApplicationMockRuntime()
    const previousName = target.customer.repository.read().customers[0]!.name

    expect(() => importApplicationData(target, exported)).toThrow('当前浏览器无法使用本地存储，数据导入未执行')
    expect(target.customer.repository.read().customers[0]!.name).toBe(previousName)
  })

  it('keeps a newly listed coco SKU and other core data after a browser reload', () => {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 Chrome/140.0')
    window.localStorage.clear()
    const firstRuntime = createApplicationMockRuntime()
    expect(firstRuntime.procurement.service.getWorkspace(admin).skus.filter((item) => item.productStatus === 'on-sale' && !item.deleted)).toHaveLength(0)

    const listed = createListedProduct(firstRuntime, 'coco')
    firstRuntime.customer.repository.transact((state) => { state.customers[0]!.name = '持久化客户' })
    firstRuntime.procurement.repository.transact((state) => { state.suppliers[0]!.name = '持久化供应商' })

    const reloadedRuntime = createApplicationMockRuntime()
    const selectable = reloadedRuntime.procurement.service.getWorkspace(admin).skus.filter((item) => item.productStatus === 'on-sale' && !item.deleted)
    expect(selectable).toEqual(expect.arrayContaining([expect.objectContaining({ skuId: listed.skus[0]!.id, productName: 'coco' })]))
    expect(reloadedRuntime.customer.repository.read().customers[0]!.name).toBe('持久化客户')
    expect(reloadedRuntime.procurement.repository.read().suppliers[0]!.name).toBe('持久化供应商')
  })

  it('keeps share tokens and refund-owned ids unique after a browser reload', () => {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 Chrome/140.0')
    let namespace = 0
    vi.spyOn(window.crypto, 'randomUUID').mockImplementation(() => `${String(++namespace).padStart(8, '0')}-0000-4000-8000-000000000000`)
    window.localStorage.clear()

    const firstRuntime = createApplicationMockRuntime()
    const firstShare = firstRuntime.order.service.createShare(admin, 'order-001')
    const firstCredit = firstRuntime.order.financeRefunds.createReturnCredit({
      requestId: 'reload-credit-first',
      sourceType: 'customer-return',
      sourceId: 'reload-return-first',
      sourceNo: 'TH-RELOAD-00001',
      orderId: 'order-006',
      amountCents: 100,
      refundPreference: 'original',
      occurredAt: '2026-08-10T10:00:00+08:00',
      operator: { id: admin.actorId, name: '测试管理员', role: admin.role },
    })

    const reloadedRuntime = createApplicationMockRuntime()
    const secondShare = reloadedRuntime.order.service.createShare(admin, 'order-001')
    const secondCredit = reloadedRuntime.order.financeRefunds.createReturnCredit({
      requestId: 'reload-credit-second',
      sourceType: 'customer-return',
      sourceId: 'reload-return-second',
      sourceNo: 'TH-RELOAD-00002',
      orderId: 'order-006',
      amountCents: 100,
      refundPreference: 'original',
      occurredAt: '2026-08-10T10:00:00+08:00',
      operator: { id: admin.actorId, name: '测试管理员', role: admin.role },
    })

    expect(secondShare.token).not.toBe(firstShare.token)
    expect(reloadedRuntime.order.service.viewSharedOrder(secondShare.token).orderNo).toBe('CA000000-260710-60001')
    expect(secondCredit.credit.id).not.toBe(firstCredit.credit.id)
    expect(secondCredit.refund?.id).not.toBe(firstCredit.refund?.id)
    const financeState = reloadedRuntime.finance.repository.read()
    expect(new Set(financeState.creditAdjustments.map((item) => item.id)).size).toBe(financeState.creditAdjustments.length)
    expect(new Set(financeState.refunds.map((item) => item.id)).size).toBe(financeState.refunds.length)
  })
})
