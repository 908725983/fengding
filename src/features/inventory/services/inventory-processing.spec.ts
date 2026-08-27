import { describe, expect, it } from 'vitest'
import { createInventoryMockSession } from '../../../../mock/handlers/inventory-handler'
import type { InventoryActor, ProcessingOrderSourceProvider, ProcessingRecipeDraft } from '../types'

const admin: InventoryActor = { actorId: 'admin-processing', role: 'super-admin' }
const supervisor: InventoryActor = { actorId: 'supervisor-processing', role: 'sales-supervisor' }
const finance: InventoryActor = { actorId: 'finance-processing', role: 'finance' }
const at = '2026-08-10T10:00:00+08:00'

function recipeDraft(outputs: ProcessingRecipeDraft['outputs'] = [{ skuId: 'sku-4', quantityMilli: 5000, warehouseId: 'warehouse-main', primary: true, costAllocationBasisPoints: 10000 }]): ProcessingRecipeDraft {
  return { code: 'BOM-DEMO-001', name: '演示组合配方', method: 'combination', category: '演示加工', note: null, outputs, materials: [{ skuId: 'sku-1', quantityMilli: 10000, warehouseId: 'warehouse-main' }] }
}

function createOrder(session: ReturnType<typeof createInventoryMockSession>, outputs?: ProcessingRecipeDraft['outputs']) {
  const recipe = session.service.saveProcessingRecipe(admin, recipeDraft(outputs))
  const plan = session.service.createProcessingPlan(admin, { sourceType: 'direct', recipeId: recipe.id, plannedAt: at, plannedQuantityMilli: 5000, processingWarehouseId: 'warehouse-main' })
  const order = session.service.createProcessingOrder(admin, { planId: plan.id, recipeId: recipe.id, plannedQuantityMilli: 5000, processingWarehouseId: 'warehouse-main' })
  return { recipe, plan, order }
}

function pickAll(session: ReturnType<typeof createInventoryMockSession>, orderId: string) {
  let order = session.repository.read().processingOrders!.find((item) => item.id === orderId)!
  const first = session.service.createMaterialPick(admin, { processingOrderId: order.id, warehouseId: 'warehouse-main', occurredAt: at, lines: [{ materialLineId: order.materials[0]!.id, actualQuantityMilli: 4000 }] })
  session.service.confirmMaterialPick(admin, first.id, first.version, 'pick-request-1')
  order = session.repository.read().processingOrders!.find((item) => item.id === orderId)!
  const second = session.service.createMaterialPick(admin, { processingOrderId: order.id, warehouseId: 'warehouse-main', occurredAt: at, lines: [{ materialLineId: order.materials[0]!.id, actualQuantityMilli: 6000 }] })
  session.service.confirmMaterialPick(admin, second.id, second.version, 'pick-request-2')
  return session.repository.read().processingOrders!.find((item) => item.id === orderId)!
}

describe('INV-004 processing service', () => {
  it('runs recipe → plan → split FIFO picks → original-batch return → atomic completion with quantity and cost conservation', () => {
    const session = createInventoryMockSession(); const materialBefore = session.repository.read().balances.filter((item) => item.warehouseId === 'warehouse-main' && item.skuId === 'sku-1').reduce((sum, item) => sum + item.quantityMilli, 0)
    const { plan, order: created } = createOrder(session); let order = pickAll(session, created.id)
    expect(order.status).toBe('processing'); expect(order.materials[0]?.pickedQuantityMilli).toBe(10000)
    const pickMovement = session.repository.read().movements.find((item) => item.sourceType === 'processing-material-pick' && item.sourceId === session.repository.read().materialPicks![0]!.id)!
    const returned = session.service.createMaterialReturn(admin, { processingOrderId: order.id, warehouseId: 'warehouse-main', occurredAt: at, lines: [{ materialLineId: order.materials[0]!.id, pickMovementId: pickMovement.id, quantityMilli: 2000, locationId: 'location-main-a' }] })
    session.service.confirmMaterialReturn(admin, returned.id, returned.version, 'return-request-1')
    order = session.repository.read().processingOrders!.find((item) => item.id === order.id)!
    const completed = session.service.completeProcessingOrder(admin, { requestId: 'completion-request-1', processingOrderId: order.id, expectedVersion: order.version, occurredAt: at, outputs: [{ outputLineId: order.outputs[0]!.id, actualQuantityMilli: 5000, locationId: 'location-main-a' }] })
    const replay = session.service.completeProcessingOrder(admin, { requestId: 'completion-request-1', processingOrderId: order.id, expectedVersion: order.version, occurredAt: at, outputs: [{ outputLineId: order.outputs[0]!.id, actualQuantityMilli: 5000, locationId: 'location-main-a' }] })
    const state = session.repository.read(); const materialAfter = state.balances.filter((item) => item.warehouseId === 'warehouse-main' && item.skuId === 'sku-1').reduce((sum, item) => sum + item.quantityMilli, 0); const outputAfter = state.balances.filter((item) => item.warehouseId === 'warehouse-main' && item.skuId === 'sku-4').reduce((sum, item) => sum + item.quantityMilli, 0)
    expect(completed.status).toBe('completed'); expect(replay.id).toBe(completed.id); expect(materialBefore - materialAfter).toBe(8000); expect(outputAfter).toBe(5000)
    expect(completed.outputs[0]?.allocatedCostCents).toBe(5640); expect(state.processingPlans!.find((item) => item.id === plan.id)?.status).toBe('completed')
    expect(session.service.listProcessingYields(admin).items[0]).toMatchObject({ actualUsedQuantityMilli: 8000, actualOutputQuantityMilli: 5000, expectedOutputQuantityMilli: 4000, yieldBasisPoints: 12500 })
  })

  it('allocates multi-output consumed cost by confirmed percentages and gives integer-cent remainder to the primary output', () => {
    const session = createInventoryMockSession(); const { order: created } = createOrder(session, [{ skuId: 'sku-4', quantityMilli: 5000, warehouseId: 'warehouse-main', primary: true, costAllocationBasisPoints: 7000 }, { skuId: 'sku-3', quantityMilli: 2000, warehouseId: 'warehouse-main', primary: false, costAllocationBasisPoints: 3000 }]); let order = pickAll(session, created.id)
    order = session.repository.read().processingOrders!.find((item) => item.id === order.id)!
    const completed = session.service.completeProcessingOrder(admin, { requestId: 'completion-multi', processingOrderId: order.id, expectedVersion: order.version, occurredAt: at, outputs: [{ outputLineId: order.outputs[0]!.id, actualQuantityMilli: 5000, locationId: 'location-main-a' }, { outputLineId: order.outputs[1]!.id, actualQuantityMilli: 2000, locationId: 'location-main-a', batchNumber: 'PROCESS-MULTI-SKU3', productionDate: '2026-08-10' }] })
    expect(completed.outputs.reduce((sum, item) => sum + (item.allocatedCostCents ?? 0), 0)).toBe(7040)
    expect(completed.outputs.map((item) => item.allocatedCostCents)).toEqual([4928, 2112])
  })

  it('rolls back the whole completion when one output location or trace input is invalid', () => {
    const session = createInventoryMockSession(); const { order: created } = createOrder(session); const order = pickAll(session, created.id); const before = session.repository.read()
    expect(() => session.service.completeProcessingOrder(admin, { requestId: 'completion-invalid', processingOrderId: order.id, expectedVersion: order.version, occurredAt: at, outputs: [{ outputLineId: order.outputs[0]!.id, actualQuantityMilli: 5000, locationId: 'location-virtual-a' }] })).toThrowError(expect.objectContaining({ code: 'INVALID_STATE' }))
    expect(session.repository.read()).toEqual(before)
  })

  it('enforces unique/version/overpick/lock boundaries and three-layer role behavior', () => {
    const session = createInventoryMockSession(); const { recipe, order } = createOrder(session)
    expect(() => session.service.saveProcessingRecipe(admin, recipeDraft())).toThrowError(expect.objectContaining({ code: 'DUPLICATE' }))
    expect(() => session.service.createMaterialPick(admin, { processingOrderId: order.id, warehouseId: 'warehouse-main', occurredAt: at, lines: [{ materialLineId: order.materials[0]!.id, actualQuantityMilli: 10001 }] })).toThrowError(expect.objectContaining({ code: 'INVALID_STATE' }))
    expect(() => session.service.deleteProcessingRecipe(admin, recipe.id)).toThrowError(expect.objectContaining({ code: 'INVALID_STATE' }))
    expect(session.service.listProcessingRecipes(supervisor).total).toBe(1)
    expect(() => session.service.listProcessingRecipes(finance)).toThrowError(expect.objectContaining({ code: 'PERMISSION_DENIED' }))
    const locked = session.repository.read(); locked.inventoryLocks = [{ stocktakeId: 'stocktake-lock', warehouseId: 'warehouse-main', skuId: 'sku-1' }]; session.repository.reset(locked)
    const pick = session.service.createMaterialPick(admin, { processingOrderId: order.id, warehouseId: 'warehouse-main', occurredAt: at, lines: [{ materialLineId: order.materials[0]!.id, actualQuantityMilli: 1000 }] })
    const before = session.repository.read(); expect(() => session.service.confirmMaterialPick(admin, pick.id, pick.version, 'locked-pick')).toThrowError(); expect(session.repository.read()).toEqual(before)
  })

  it('rejects an order when fixed-precision recipe scaling would create a zero-quantity line', () => {
    const session = createInventoryMockSession()
    const recipe = session.service.saveProcessingRecipe(admin, {
      ...recipeDraft([{ skuId: 'sku-4', quantityMilli: 1000000, warehouseId: 'warehouse-main', primary: true, costAllocationBasisPoints: 10000 }]),
      code: 'BOM-SCALE-EDGE',
      materials: [{ skuId: 'sku-1', quantityMilli: 1, warehouseId: 'warehouse-main' }],
    })
    expect(() => session.service.createProcessingOrder(admin, {
      planId: null,
      recipeId: recipe.id,
      plannedQuantityMilli: 1,
      processingWarehouseId: 'warehouse-main',
    })).toThrowError(expect.objectContaining({ name: 'InventoryValidationError' }))
    expect(session.repository.read().processingOrders).toHaveLength(0)
  })

  it('creates a sales-order plan only from eligible remaining quantity without mutating the source order provider', () => {
    const source = { orderId: 'order-source-1', orderNo: 'CA-DEMO-1', status: 'approved', customerName: '演示客户', updatedAt: at, lines: [{ orderLineId: 'order-line-1', skuId: 'sku-4', productName: '演示草稿商品', skuCode: 'SKU-000004', orderedQuantityMilli: 5000, fulfilledQuantityMilli: 1000, remainingQuantityMilli: 4000 }] }
    const provider: ProcessingOrderSourceProvider = { listEligibleOrders: () => ({ state: 'available', items: [structuredClone(source)], version: 'orders:v1', message: null }), getEligibleOrder: (id) => id === source.orderId ? structuredClone(source) : null }
    const session = createInventoryMockSession('normal', { processingOrderProvider: provider }); const recipe = session.service.saveProcessingRecipe(admin, recipeDraft())
    const plan = session.service.createProcessingPlan(admin, { sourceType: 'sales-order', salesOrderId: source.orderId, salesOrderLineId: source.lines[0]!.orderLineId, recipeId: recipe.id, plannedAt: at, plannedQuantityMilli: 4000, processingWarehouseId: 'warehouse-main' })
    expect(plan.sourceOrder?.orderNo).toBe(source.orderNo); expect(source.lines[0]!.remainingQuantityMilli).toBe(4000)
    expect(() => session.service.createProcessingPlan(admin, { sourceType: 'sales-order', salesOrderId: source.orderId, salesOrderLineId: source.lines[0]!.orderLineId, recipeId: recipe.id, plannedAt: at, plannedQuantityMilli: 1, processingWarehouseId: 'warehouse-main' })).toThrowError(expect.objectContaining({ code: 'INVALID_STATE' }))
  })

  it('previews recipe imports and rejects the whole batch when any row is invalid', () => {
    const session = createInventoryMockSession(); const valid = recipeDraft(); const invalid = { ...recipeDraft(), code: 'BOM-DEMO-002', outputs: [{ ...recipeDraft().outputs[0]!, costAllocationBasisPoints: 9000 }] }
    const preview = session.service.previewProcessingRecipeImport(admin, [valid, invalid]); expect(preview.valid).toBe(false); expect(preview.errors[0]).toContain('100%')
    const before = session.repository.read(); expect(() => session.service.importProcessingRecipes(admin, [valid, invalid])).toThrow(); expect(session.repository.read()).toEqual(before)
  })

  it('rejects concurrently reserved pick and return quantities before changing inventory', () => {
    const session = createInventoryMockSession(); const { order } = createOrder(session); const materialLineId = order.materials[0]!.id
    const first = session.service.createMaterialPick(admin, { processingOrderId: order.id, warehouseId: 'warehouse-main', occurredAt: at, lines: [{ materialLineId, actualQuantityMilli: 6000 }] })
    const stale = session.service.createMaterialPick(admin, { processingOrderId: order.id, warehouseId: 'warehouse-main', occurredAt: at, lines: [{ materialLineId, actualQuantityMilli: 6000 }] })
    session.service.confirmMaterialPick(admin, first.id, first.version, 'concurrent-pick-first'); const beforeStalePick = session.repository.read()
    expect(() => session.service.confirmMaterialPick(admin, stale.id, stale.version, 'concurrent-pick-stale')).toThrowError(expect.objectContaining({ code: 'CONFLICT' })); expect(session.repository.read()).toEqual(beforeStalePick)
    let current = session.repository.read().processingOrders!.find((item) => item.id === order.id)!; const rest = session.service.createMaterialPick(admin, { processingOrderId: order.id, warehouseId: 'warehouse-main', occurredAt: at, lines: [{ materialLineId, actualQuantityMilli: 4000 }] }); session.service.confirmMaterialPick(admin, rest.id, rest.version, 'concurrent-pick-rest')
    current = session.repository.read().processingOrders!.find((item) => item.id === order.id)!; const movement = session.repository.read().movements.find((item) => item.sourceId === first.id)!
    const returnA = session.service.createMaterialReturn(admin, { processingOrderId: current.id, warehouseId: 'warehouse-main', occurredAt: at, lines: [{ materialLineId, pickMovementId: movement.id, quantityMilli: 4000, locationId: 'location-main-a' }] })
    const returnB = session.service.createMaterialReturn(admin, { processingOrderId: current.id, warehouseId: 'warehouse-main', occurredAt: at, lines: [{ materialLineId, pickMovementId: movement.id, quantityMilli: 3000, locationId: 'location-main-a' }] })
    session.service.confirmMaterialReturn(admin, returnA.id, returnA.version, 'concurrent-return-first'); const beforeStaleReturn = session.repository.read()
    expect(() => session.service.confirmMaterialReturn(admin, returnB.id, returnB.version, 'concurrent-return-stale')).toThrowError(expect.objectContaining({ code: 'CONFLICT' })); expect(session.repository.read()).toEqual(beforeStaleReturn)
  })
})
