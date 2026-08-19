import { beforeEach, describe, expect, it } from 'vitest'
import { createProcurementMockSession } from '../../../../mock/handlers/procurement-handler'
import type { ProcurementActor, SupplierDraft } from '../types'

const admin: ProcurementActor = { role: 'super-admin', actorId: 'admin-demo' }
const warehouse: ProcurementActor = { role: 'warehouse', actorId: 'warehouse-demo' }
const draft: SupplierDraft = { code: ' sup-new ', name: '演示新增供应商', tradeType: 'purchase', deliveryMode: 'both', contactName: '演示联系人', contactPhone: '000-3000-0001', address: null, bankName: '演示银行', bankAccount: '6222000000009876', note: null }

describe('procurement service', () => {
  let session = createProcurementMockSession()
  beforeEach(() => { session = createProcurementMockSession() })

  it('filters, pages and masks bank account by role', () => {
    expect(session.service.listSuppliers(admin).total).toBe(3)
    expect(session.service.listSuppliers(admin, { status: 'enabled' }).total).toBe(2)
    expect(session.service.listSuppliers(admin, { skuKeyword: 'SKU-000001' }).total).toBe(2)
    expect(session.service.getSupplier(admin, 'supplier-1').bankAccount).toBe('6222000000004321')
    expect(session.service.getSupplier(warehouse, 'supplier-1').bankAccount).toBe('****4321')
  })

  it('creates idempotently, enforces unique identifiers and optimistic locking', () => {
    const command = { value: draft, expectedVersion: 0, requestId: 'create-1' }
    const first = session.service.createSupplier(admin, command); const replay = session.service.createSupplier(admin, command)
    expect(replay).toEqual(first); expect(session.repository.read().suppliers).toHaveLength(4); expect(first.code).toBe('SUP-NEW')
    expect(() => session.service.createSupplier(admin, { ...command, requestId: 'create-2' })).toThrow(/编码已存在/)
    expect(() => session.service.updateSupplier(admin, first.id, { value: { ...draft, name: '另一个名称' }, expectedVersion: 0, requestId: 'update-stale' })).toThrow(/其他操作修改/)
    expect(() => session.service.updateSupplier(admin, first.id, { value: { ...draft, code: 'SUP-CHANGED' }, expectedVersion: 1, requestId: 'update-code' })).toThrow(/不可修改/)
  })

  it('does not log full bank accounts and never cascades supplier status', () => {
    session.service.updateSupplier(admin, 'supplier-1', { value: { ...draft, code: 'SUP-000001', name: '演示华北食品供应商' }, expectedVersion: 1, requestId: 'update-1' })
    const result = session.service.setSupplierStatus(admin, 'supplier-1', 'disabled', 2, 'disable-1')
    expect(result.status).toBe('disabled'); expect(session.repository.read().supplierProducts.filter((item) => item.supplierId === 'supplier-1').map((item) => item.status)).toEqual(['enabled', 'disabled'])
    expect(JSON.stringify(session.repository.read().auditLogs)).not.toContain('6222000000009876')
  })

  it('preserves hidden bank data when warehouse edits other fields', () => {
    const current = session.service.getSupplier(warehouse, 'supplier-1')
    session.service.updateSupplier(warehouse, current.id, { value: { code: current.code, name: '仓库更新名称', tradeType: current.tradeType, deliveryMode: current.deliveryMode, contactName: current.contactName, contactPhone: current.contactPhone, address: current.address, bankName: current.bankName, bankAccount: current.bankAccount, note: current.note }, expectedVersion: current.version, requestId: 'warehouse-update' })
    expect(session.service.getSupplier(admin, 'supplier-1').bankAccount).toBe('6222000000004321')
    expect(session.service.getSupplier(warehouse, 'supplier-1').bankAccount).toBe('****4321')
  })

  it('manages sku relations, unit snapshots, price history and one preferred supplier', () => {
    const historical = session.service.listSupplierProducts(admin, { supplierId: 'supplier-1' }).find((item) => item.skuId === 'sku-2')!
    expect(historical.procurementUnitId).toBe('unit-box'); expect(historical.procurementUnitRateMilli).toBe(12000)
    const changed = session.service.updateSupplierProduct(admin, 'supplier-product-2', { supplyPriceCents: 750, preferred: true }, 1, 'relation-price')
    expect(changed).toMatchObject({ supplyPriceCents: 750, preferred: true, version: 2 })
    expect(session.repository.read().supplierProducts.find((item) => item.id === 'supplier-product-1')?.preferred).toBe(false)
    expect(session.repository.read().auditLogs.at(-1)?.detail).toContain('780 分 -> 750 分')
    expect(() => session.service.createSupplierProduct(admin, { value: { supplierId: 'supplier-3', skuId: 'sku-1', supplyPriceCents: 700, preferred: false }, expectedVersion: 0, requestId: 'disabled-supplier' })).toThrow(/启用供应商/)
  })

  it('provider only returns effective and mode-compatible candidates without guessing lowest price', () => {
    const provider = session.service.createSupplyProvider()
    expect(provider.listCandidates('sku-1')).toHaveLength(2)
    expect(provider.getPreferred('sku-1')?.supplierId).toBe('supplier-1')
    expect(provider.listCandidates('sku-1', 'direct').map((item) => item.supplierId)).toEqual(['supplier-2'])
    expect(provider.getPreferred('sku-1', 'direct')).toBeNull()
    expect(provider.listCandidates('sku-3')).toEqual([])
  })

  it('atomically previews import and exports filtered, role-masked csv', () => {
    const invalid = session.service.previewSupplierImport(admin, [{ ...draft, rowNumber: 1, code: 'SUP-000001' }])
    expect(invalid.valid).toBe(false); expect(() => session.service.importSuppliers(admin, invalid, 'import-invalid')).toThrow(/未写入/); expect(session.repository.read().suppliers).toHaveLength(3)
    const valid = session.service.previewSupplierImport(admin, [{ ...draft, rowNumber: 1 }]); const imported = session.service.importSuppliers(admin, valid, 'import-1'); expect(imported).toHaveLength(1); expect(session.service.importSuppliers(admin, valid, 'import-1')).toEqual(imported)
    expect(session.service.exportSuppliersCsv(admin, { status: 'disabled' })).toContain('SUP-000003')
    const masked = session.service.exportSuppliersCsv(warehouse); expect(masked).toContain('****4321'); expect(masked).not.toContain('6222000000004321')
  })

  it('denies non-procurement roles and keeps direct delivery unavailable rather than empty', () => {
    for (const role of ['sales-supervisor', 'salesperson', 'finance'] as const) expect(() => session.service.listSuppliers({ role, actorId: role })).toThrow(/无权访问/)
    expect(session.service.getDirectDeliveryAvailability()).toEqual({ availability: 'unavailable', reason: 'PURCHASE_EXECUTION_PROVIDER_UNAVAILABLE', message: '采购直送执行数据尚未接入' })
  })

  it('isolates catalog partial failure from supplier master data', () => {
    const partial = createProcurementMockSession('partial-failure'); const workspace = partial.service.getWorkspace(admin)
    expect(workspace.suppliers.total).toBe(3); expect(workspace.catalogAvailable).toBe(false); expect(workspace.supplierProducts).toEqual([])
  })
})
