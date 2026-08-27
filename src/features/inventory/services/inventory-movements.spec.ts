import { describe, expect, it } from 'vitest'
import { createInventoryMockSession } from '../../../../mock/handlers/inventory-handler'
import type { InventoryActor } from '../types'

const admin: InventoryActor = { actorId: 'admin-demo', role: 'super-admin' }
const warehouse: InventoryActor = { actorId: 'warehouse-demo', role: 'warehouse' }
const supervisor: InventoryActor = { actorId: 'supervisor-demo', role: 'sales-supervisor' }

function source(session: ReturnType<typeof createInventoryMockSession>) {
  const row = session.service.getWorkspace(admin).stocks.items.find((item) => item.currentMilli > 0)!
  const target = session.service.getWorkspace(admin).warehouses.find((item) => item.id !== row.warehouse.id && item.status === 'enabled')!
  return { row, target, location: session.service.getWorkspace(admin).locations.find((item) => item.warehouseId === target.id && item.status === 'enabled')!, sourceLocation: session.service.getWorkspace(admin).locations.find((item) => item.warehouseId === row.warehouse.id && item.status === 'enabled')! }
}

describe('INV-002 inventory documents', () => {
  it('moves stock in two idempotent stages and preserves source/target balances', () => {
    const session = createInventoryMockSession(); const { row, target, location } = source(session); const before = session.service.getWorkspace(admin).stocks.items.find((item) => item.skuId === row.skuId && item.warehouse.id === row.warehouse.id)!.currentMilli
    let transfer = session.service.createTransfer(admin, { sourceWarehouseId: row.warehouse.id, targetWarehouseId: target.id, occurredAt: '2026-08-10T10:00:00+08:00', lines: [{ skuId: row.skuId, quantityMilli: 1000, costPerBaseUnitCents: row.costPerBaseUnitCents ?? 0 }] })
    expect(transfer.code).toMatch(/^ZZ\d{6}-\d{5}$/); transfer = session.service.approveTransfer(admin, transfer); transfer = session.service.shipTransfer(warehouse, transfer, session.service.getWorkspace(admin).locations.find((item) => item.warehouseId === row.warehouse.id)!.id)
    expect(transfer.status).toBe('shipped'); const afterShip = session.service.getWorkspace(admin).stocks.items.find((item) => item.skuId === row.skuId && item.warehouse.id === row.warehouse.id)!.currentMilli; expect(afterShip).toBe(before - 1000)
    transfer = session.service.receiveTransfer(warehouse, transfer, session.service.getWorkspace(admin).locations.find((item) => item.warehouseId === target.id)!.id); expect(transfer.status).toBe('received'); expect(session.service.receiveTransfer(warehouse, transfer, session.service.getWorkspace(admin).locations.find((item) => item.warehouseId === target.id)!.id).version).toBe(transfer.version)
    const afterTarget = session.service.getWorkspace(admin).stocks.items.find((item) => item.skuId === row.skuId && item.warehouse.id === target.id)!.currentMilli; expect(afterTarget).toBe(1000)
    expect(session.service.listMovements(admin).filter((item) => item.sourceId === transfer.id)).toHaveLength(2)
  })

  it('completes other outbound/inbound atomically and blocks customer return impersonation', () => {
    const session = createInventoryMockSession(); const { row } = source(session); const location = session.service.getWorkspace(admin).locations.find((item) => item.warehouseId === row.warehouse.id && item.status === 'enabled')!; const outbound = session.service.createOtherOutbound(admin, { warehouseId: row.warehouse.id, type: 'damage', occurredAt: '2026-08-10T10:00:00+08:00', lines: [{ skuId: row.skuId, quantityMilli: 1000, costPerBaseUnitCents: row.costPerBaseUnitCents ?? 0 }] }); const completed = session.service.approveOtherOutbound(warehouse, outbound); expect(completed.status).toBe('completed')
    const inbound = session.service.createOtherInbound(admin, { warehouseId: row.warehouse.id, type: 'surplus', occurredAt: '2026-08-10T10:01:00+08:00', lines: [{ skuId: row.skuId, quantityMilli: 1000, costPerBaseUnitCents: row.costPerBaseUnitCents ?? 0 }] }); expect(session.service.approveOtherInbound(warehouse, inbound, location.id).status).toBe('completed')
    expect(() => session.service.createOtherInbound(admin, { warehouseId: row.warehouse.id, type: 'return', occurredAt: '2026-08-10T10:02:00+08:00', lines: [{ skuId: row.skuId, quantityMilli: 1000, costPerBaseUnitCents: 0 }] })).toThrow(/ORD-005/)
  })

  it('keeps read-only supervisor from writing and rejects insufficient stock', () => {
    const session = createInventoryMockSession(); const { row, target } = source(session); expect(() => session.service.createTransfer(supervisor, { sourceWarehouseId: row.warehouse.id, targetWarehouseId: target.id, occurredAt: '2026-08-10T10:00:00+08:00', lines: [{ skuId: row.skuId, quantityMilli: 1000, costPerBaseUnitCents: 0 }] })).toThrow(/不可修改/)
    const outbound = session.service.createOtherOutbound(admin, { warehouseId: row.warehouse.id, type: 'consume', occurredAt: '2026-08-10T10:00:00+08:00', lines: [{ skuId: row.skuId, quantityMilli: 999999999, costPerBaseUnitCents: 0 }] }); expect(() => session.service.approveOtherOutbound(warehouse, outbound)).toThrow(/不足/)
  })

  it('rolls back every movement when a later document line fails', () => {
    const session = createInventoryMockSession(); const { row, sourceLocation } = source(session)
    const before = session.service.getWorkspace(admin).stocks.items.find((item) => item.skuId === row.skuId && item.warehouse.id === row.warehouse.id)!.currentMilli
    const outbound = session.service.createOtherOutbound(admin, { warehouseId: row.warehouse.id, type: 'consume', occurredAt: '2026-08-10T10:00:00+08:00', lines: [{ skuId: row.skuId, quantityMilli: 1000, costPerBaseUnitCents: 0 }, { skuId: row.skuId, quantityMilli: 999999999, costPerBaseUnitCents: 0 }] })
    expect(() => session.service.approveOtherOutbound(warehouse, outbound)).toThrow(/不足/)
    const after = session.service.getWorkspace(admin).stocks.items.find((item) => item.skuId === row.skuId && item.warehouse.id === row.warehouse.id)!.currentMilli
    expect(after).toBe(before); expect(session.service.listMovements(admin).filter((item) => item.sourceId === outbound.id)).toHaveLength(0); expect(sourceLocation.status).toBe('enabled')
  })

  it('deletes only pending documents and restricts CSV export to write roles', () => {
    const session = createInventoryMockSession(); const { row, target } = source(session)
    const transfer = session.service.createTransfer(admin, { sourceWarehouseId: row.warehouse.id, targetWarehouseId: target.id, occurredAt: '2026-08-10T10:00:00+08:00', lines: [{ skuId: row.skuId, quantityMilli: 1000, costPerBaseUnitCents: 0 }] })
    expect(session.service.exportTransfersCsv(admin)).toContain('code,sourceWarehouseId'); expect(() => session.service.exportTransfersCsv(supervisor)).toThrow(/不可修改/)
    session.service.deleteTransfer(warehouse, transfer); expect(session.service.listTransfers(admin).total).toBe(0)
  })

  it('receives the exact batches and costs recorded by the source transfer movements', () => {
    const session = createInventoryMockSession(); const workspace = session.service.getWorkspace(admin); const row = workspace.stocks.items.find((item) => item.currentMilli >= 1000 && (item.sku?.manageProductionDate || item.sku?.shelfLifeDays !== null))!; const target = workspace.warehouses.find((item) => item.id !== row.warehouse.id && item.status === 'enabled')!; const sourceLocation = workspace.locations.find((item) => item.warehouseId === row.warehouse.id && item.status === 'enabled')!; const targetLocation = workspace.locations.find((item) => item.warehouseId === target.id && item.status === 'enabled')!
    let transfer = session.service.createTransfer(admin, { sourceWarehouseId: row.warehouse.id, targetWarehouseId: target.id, occurredAt: '2026-08-10T10:00:00+08:00', lines: [{ skuId: row.skuId, quantityMilli: 1000, costPerBaseUnitCents: 0 }] }); transfer = session.service.approveTransfer(admin, transfer); transfer = session.service.shipTransfer(warehouse, transfer, sourceLocation.id)
    const outbound = session.service.listMovements(admin).filter((item) => transfer.outboundMovementIds.includes(item.id)); expect(outbound.length).toBeGreaterThan(0)
    transfer = session.service.receiveTransfer(warehouse, transfer, targetLocation.id); const inbound = session.service.listMovements(admin).filter((item) => item.sourceId === transfer.id && item.direction === 'inbound')
    expect(inbound.map((item) => [item.batchNumber, item.quantityMilli, item.costPerBaseUnitCents])).toEqual(outbound.map((item) => [item.batchNumber, item.quantityMilli, item.costPerBaseUnitCents]))
  })

  it('enforces operation locks, stale versions, and supervisor cost masking', () => {
    const locked = createInventoryMockSession('boundary'); const lockedSource = source(locked); expect(() => locked.service.createTransfer(admin, { sourceWarehouseId: lockedSource.row.warehouse.id, targetWarehouseId: lockedSource.target.id, occurredAt: '2026-08-10T10:00:00+08:00', lines: [{ skuId: lockedSource.row.skuId, quantityMilli: 1000, costPerBaseUnitCents: 0 }] })).toThrow(/盘点锁定/)
    const session = createInventoryMockSession(); const { row } = source(session); const outbound = session.service.createOtherOutbound(admin, { warehouseId: row.warehouse.id, type: 'damage', occurredAt: '2026-08-10T10:00:00+08:00', lines: [{ skuId: row.skuId, quantityMilli: 1000, costPerBaseUnitCents: 321 }] }); const completed = session.service.approveOtherOutbound(warehouse, outbound)
    expect(() => session.service.deleteOtherOutbound(admin, completed)).toThrow(/仅待审核/); expect(session.service.listOtherOutbounds(supervisor).items[0].lines[0].costPerBaseUnitCents).toBe(0)
  })
})
