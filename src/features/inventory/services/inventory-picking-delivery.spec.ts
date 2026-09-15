import { describe, expect, it } from 'vitest'
import { createInventoryMockSession } from '../../../../mock/handlers/inventory-handler'
import type { InventoryActor, PickingOrderCoordinator, PickingOrderSnapshot } from '../types'

const admin: InventoryActor = { actorId: 'admin-picking', role: 'super-admin' }
const supervisor: InventoryActor = { actorId: 'supervisor-picking', role: 'sales-supervisor' }
const finance: InventoryActor = { actorId: 'finance-picking', role: 'finance' }
const now = '2026-08-10T09:00:00+08:00'

function order(id: string, quantityMilli = 5000, deliveryMethod: PickingOrderSnapshot['deliveryMethod'] = 'door-delivery'): PickingOrderSnapshot {
  return {
    orderId: id, orderNo: `XS-${id}`, status: 'approved', customerName: `客户-${id}`,
    warehouseId: 'warehouse-main', warehouseName: '主仓', requestedDeliveryAt: '2026-08-11T09:00:00+08:00',
    deliveryMethod, updatedAt: now, province: '山东省', city: '临沂市', district: '兰山区', address: '测试路 1 号', urgency: null,
    lines: [{ orderLineId: `${id}-line-1`, skuId: 'sku-1', skuCode: 'SKU-000001', productName: '测试商品', specification: '标准', unitId: 'unit-1', unitName: '件', conversionRateMilli: 1000, categoryId: null, orderedQuantityMilli: quantityMilli, fulfilledQuantityMilli: 0, remainingQuantityMilli: quantityMilli, weightPerBaseUnitGrams: 500 }],
  }
}

function coordinator(initial: PickingOrderSnapshot[], failOutboundAt = 0, failShipmentAt = 0) {
  let orders = structuredClone(initial); let outboundCalls = 0; let shipmentCalls = 0; let sequence = 1
  const api: PickingOrderCoordinator = {
    listPickingOrders: () => ({ state: 'available', items: structuredClone(orders.filter((item) => ['approved', 'outbound-in-progress'].includes(item.status) && item.lines.some((line) => line.remainingQuantityMilli > 0))), version: `orders:${sequence}`, message: null }),
    listDeliveryOrders: () => ({ state: 'available', items: structuredClone(orders.filter((item) => item.status === 'outbound' && item.deliveryMethod === 'door-delivery')), version: `delivery:${sequence}`, message: null }),
    getPickingOrder: (id) => structuredClone(orders.find((item) => item.orderId === id && item.lines.some((line) => line.remainingQuantityMilli > 0)) ?? null),
    confirmOutbounds: (_actor, inputs) => inputs.map((input) => {
      outboundCalls++; if (failOutboundAt && outboundCalls === failOutboundAt) throw new Error('模拟第二张订单出库失败')
      const current = orders.find((item) => item.orderId === input.orderId)!; current.lines.forEach((line) => { const command = input.lines.find((item) => item.orderLineId === line.orderLineId); line.fulfilledQuantityMilli += command?.quantityMilli ?? 0; line.remainingQuantityMilli = Math.max(0, line.orderedQuantityMilli - line.fulfilledQuantityMilli) }); current.status = input.finishShort || current.lines.every((line) => line.remainingQuantityMilli === 0) ? 'outbound' : 'outbound-in-progress'; current.updatedAt = `2026-08-10T09:00:0${sequence++}+08:00`
      return { orderId: current.orderId, outboundId: `outbound-${current.orderId}`, differenceId: input.finishShort ? `difference-${current.orderId}` : null, updatedAt: current.updatedAt }
    }),
    confirmShipments: (_actor, inputs) => inputs.map((input) => {
      shipmentCalls++; if (failShipmentAt && shipmentCalls === failShipmentAt) throw new Error('模拟第二张订单发货失败')
      const current = orders.find((item) => item.orderId === input.orderId)!; current.status = 'shipped'; current.updatedAt = `2026-08-10T10:00:0${sequence++}+08:00`; return { orderId: current.orderId, shipmentId: `shipment-${current.orderId}`, updatedAt: current.updatedAt }
    }),
    checkpoint: () => ({ orders: structuredClone(orders), outboundCalls, shipmentCalls, sequence }),
    restore: (checkpoint) => { const saved = checkpoint as { orders: PickingOrderSnapshot[]; outboundCalls: number; shipmentCalls: number; sequence: number }; orders = structuredClone(saved.orders); outboundCalls = saved.outboundCalls; shipmentCalls = saved.shipmentCalls; sequence = saved.sequence },
  }
  return { api, orders: () => structuredClone(orders), outboundCalls: () => outboundCalls, shipmentCalls: () => shipmentCalls }
}

function sessionWith(initial: PickingOrderSnapshot[], failOutboundAt = 0, failShipmentAt = 0) {
  const bridge = coordinator(initial, failOutboundAt, failShipmentAt)
  const session = createInventoryMockSession('normal', { pickingOrderCoordinator: bridge.api, deliveryStaffProvider: { listStaff: () => [{ id: 'staff-picker', name: '拣货员' }, { id: 'staff-driver', name: '配送司机' }] } })
  return { session, bridge }
}

describe('INV-005 picking and delivery service', () => {
  it('avoids persisted nested runtime IDs after a browser reload', () => {
    const previous = createInventoryMockSession()
    const persisted = previous.service.saveDeliveryRoute(admin, { name: '已保存线路', province: '山东省', city: '临沂市', district: '兰山区', stops: [{ name: '旧站点', province: '山东省', city: '临沂市', district: '兰山区', address: '旧地址 1 号' }], status: 'enabled' })
    const session = createInventoryMockSession()
    session.repository.transact((state) => { state.deliveryRoutes = [{ ...persisted, id: 'route-persisted' }] })

    const created = session.service.saveDeliveryRoute(admin, { name: '新线路', province: '山东省', city: '临沂市', district: '兰山区', stops: [{ name: '新站点', province: '山东省', city: '临沂市', district: '兰山区', address: '新地址 1 号' }], status: 'enabled' })

    expect(persisted.stops[0]?.id).toBe('log-runtime-2')
    expect(created.stops[0]?.id).toBe('log-runtime-3')
  })

  it('runs an exact individual pick from zero without changing stock until canonical Order outbound', () => {
    const { session, bridge } = sessionWith([order('order-a')]); const balancesBefore = session.repository.read().balances
    let task = session.service.createPickingTask(admin, 'order-a'); task = session.service.startPickingTask(admin, task.id, task.version, 'staff-picker')
    task = session.service.submitPickingTask(admin, task.id, task.version, task.lines.map((line) => ({ lineId: line.id, actualQuantityMilli: line.expectedQuantityMilli })))
    expect(task.status).toBe('completed'); expect(session.repository.read().balances).toEqual(balancesBefore)
    const completed = session.service.confirmPickingOutbound(admin, task.id, task.version, 'pick-outbound-a'); const replay = session.service.confirmPickingOutbound(admin, task.id, task.version, 'pick-outbound-a')
    expect(completed.outboundId).toBe('outbound-order-a'); expect(replay.id).toBe(completed.id); expect(bridge.outboundCalls()).toBe(1); expect(bridge.orders()[0]?.status).toBe('outbound')
  })

  it('distinguishes real zero from unentered quantity and supports accepted short shipment', () => {
    const { session } = sessionWith([order('order-short')]); let task = session.service.createPickingTask(admin, 'order-short'); task = session.service.startPickingTask(admin, task.id, task.version, 'staff-picker')
    task = session.service.submitPickingTask(admin, task.id, task.version, [{ lineId: task.lines[0]!.id, actualQuantityMilli: 0 }], '缺货')
    expect(task.status).toBe('picking'); expect(task.lines[0]?.actualQuantityMilli).toBe(0)
    let difference = session.service.listPickingDifferences(admin).items[0]!; difference = session.service.resolvePickingDifference(admin, difference.id, difference.version, 'accepted-short')
    task = session.repository.read().pickingTasks![0]!; expect(difference.status).toBe('accepted-short'); expect(task.status).toBe('completed')
    const outbound = session.service.confirmPickingOutbound(admin, task.id, task.version, 'pick-outbound-short'); expect(outbound.orderDifferenceId).toBe('difference-order-short')
  })

  it('conserves per-order wave allocations and rolls back both domains when a batch outbound fails', () => {
    const { session, bridge } = sessionWith([order('wave-a'), order('wave-b')], 2); const beforeOrders = bridge.orders()
    let wave = session.service.createPickingWave(admin, { strategy: 'time', warehouseId: 'warehouse-main', orderIds: ['wave-a', 'wave-b'], cutoffAt: '2026-08-11T09:00:00+08:00' }); wave = session.service.startPickingWave(admin, wave.id, wave.version, 'staff-picker')
    wave = session.service.submitPickingWave(admin, wave.id, wave.version, wave.allocations.map((line) => ({ orderId: line.orderId, orderLineId: line.orderLineId, actualQuantityMilli: line.expectedQuantityMilli })))
    const inventoryBefore = session.repository.read(); expect(() => session.service.confirmWaveOutbounds(admin, wave.id, wave.version, 'wave-outbound')).toThrow('模拟第二张订单出库失败')
    expect(session.repository.read()).toEqual(inventoryBefore); expect(bridge.orders()).toEqual(beforeOrders); expect(bridge.outboundCalls()).toBe(0)
  })

  it('revalidates wave source versions and does not recreate an already accepted short difference', () => {
    const first = order('mixed-a'); const second = order('mixed-b'); const { session } = sessionWith([first, second]); let wave = session.service.createPickingWave(admin, { strategy: 'time', warehouseId: 'warehouse-main', orderIds: [first.orderId, second.orderId], cutoffAt: '2026-08-11T09:00:00+08:00' })
    const changed = { ...second, updatedAt: '2026-08-10T09:30:00+08:00' }; session.setPickingOrderCoordinator(coordinator([first, changed]).api); expect(() => session.service.startPickingWave(admin, wave.id, wave.version, 'staff-picker')).toThrowError(expect.objectContaining({ code: 'CONFLICT' }))
    session.setPickingOrderCoordinator(coordinator([first, second]).api); wave = session.service.startPickingWave(admin, wave.id, wave.version, 'staff-picker'); wave = session.service.submitPickingWave(admin, wave.id, wave.version, wave.allocations.map((line) => ({ orderId: line.orderId, orderLineId: line.orderLineId, actualQuantityMilli: 0 })), '两单短拣')
    const differences = session.service.listPickingDifferences(admin).items; session.service.resolvePickingDifference(admin, differences.find((item) => item.orderId === first.orderId)!.id, differences.find((item) => item.orderId === first.orderId)!.version, 'accepted-short'); session.service.resolvePickingDifference(admin, differences.find((item) => item.orderId === second.orderId)!.id, differences.find((item) => item.orderId === second.orderId)!.version, 'continue-picking')
    wave = session.repository.read().pickingWaves![0]!; wave = session.service.submitPickingWave(admin, wave.id, wave.version, wave.allocations.map((line) => ({ orderId: line.orderId, orderLineId: line.orderLineId, actualQuantityMilli: line.orderId === first.orderId ? 0 : line.expectedQuantityMilli })))
    expect(wave.status).toBe('completed'); expect(session.service.listPickingDifferences(admin).items.filter((item) => item.orderId === first.orderId)).toHaveLength(1)
  })

  it('creates route and vehicle, starts delivery through canonical Order shipment, then releases vehicle without confirming receipt', () => {
    const { session, bridge } = sessionWith([order('delivery-a')]); let task = session.service.createPickingTask(admin, 'delivery-a'); task = session.service.startPickingTask(admin, task.id, task.version, 'staff-picker'); task = session.service.submitPickingTask(admin, task.id, task.version, [{ lineId: task.lines[0]!.id, actualQuantityMilli: 5000 }]); session.service.confirmPickingOutbound(admin, task.id, task.version, 'delivery-outbound')
    const vehicle = session.service.saveDeliveryVehicle(admin, { plateNumber: '鲁Q12345', type: 'van', capacityKg: 1000, defaultDriverId: 'staff-driver', status: 'idle' })
    const route = session.service.saveDeliveryRoute(admin, { name: '兰山线路', province: '山东省', city: '临沂市', district: '兰山区', stops: [{ name: '测试客户', province: '山东省', city: '临沂市', district: '兰山区', address: '测试路 1 号' }], defaultDriverId: 'staff-driver', defaultVehicleId: vehicle.id, estimatedMinutes: 30, status: 'enabled' })
    expect(session.service.listDeliveryCandidates(admin).items.map((item) => item.orderId)).toEqual(['delivery-a'])
    let delivery = session.service.createDeliveryTask(admin, { routeId: route.id, driverId: 'staff-driver', vehicleId: vehicle.id, orderIds: ['delivery-a'], plannedDepartureAt: '2026-08-11T09:00:00+08:00' }); delivery = session.service.updateDeliveryTask(admin, delivery.id, delivery.version, { routeId: route.id, driverId: 'staff-driver', vehicleId: vehicle.id, orderIds: ['delivery-a'], plannedDepartureAt: '2026-08-11T10:00:00+08:00', note: '版本化修改' }); expect(delivery.note).toBe('版本化修改'); expect(() => session.service.updateDeliveryTask(admin, delivery.id, 1, { routeId: route.id, driverId: 'staff-driver', vehicleId: vehicle.id, orderIds: ['delivery-a'], plannedDepartureAt: '2026-08-11T10:00:00+08:00' })).toThrowError(expect.objectContaining({ code: 'CONFLICT' })); delivery = session.service.startDeliveryTask(admin, delivery.id, delivery.version, 'delivery-start')
    expect(delivery.status).toBe('delivering'); expect(bridge.shipmentCalls()).toBe(1); expect(bridge.orders()[0]?.status).toBe('shipped'); expect(session.repository.read().deliveryVehicles![0]?.status).toBe('dispatching')
    delivery = session.service.completeDeliveryTask(admin, delivery.id, delivery.version); expect(delivery.status).toBe('completed'); expect(session.repository.read().deliveryVehicles![0]?.status).toBe('idle'); expect(bridge.orders()[0]?.status).toBe('shipped')
  })

  it('rolls back task, vehicle and all external shipments when a multi-order delivery start partially fails', () => {
    const { session, bridge } = sessionWith([order('delivery-b'), order('delivery-c')], 0, 2)
    for (const orderId of ['delivery-b', 'delivery-c']) { let task = session.service.createPickingTask(admin, orderId); task = session.service.startPickingTask(admin, task.id, task.version, 'staff-picker'); task = session.service.submitPickingTask(admin, task.id, task.version, [{ lineId: task.lines[0]!.id, actualQuantityMilli: task.lines[0]!.expectedQuantityMilli }]); session.service.confirmPickingOutbound(admin, task.id, task.version, `outbound-${orderId}`) }
    const vehicle = session.service.saveDeliveryVehicle(admin, { plateNumber: '鲁Q54321', type: 'van', capacityKg: 1000, status: 'idle' }); const route = session.service.saveDeliveryRoute(admin, { name: '批量配送线路', province: '山东省', city: '临沂市', district: '兰山区', stops: [{ name: '测试站', province: '山东省', city: '临沂市', district: '兰山区', address: '测试路 1 号' }], status: 'enabled' }); const delivery = session.service.createDeliveryTask(admin, { routeId: route.id, driverId: 'staff-driver', vehicleId: vehicle.id, orderIds: ['delivery-b', 'delivery-c'], plannedDepartureAt: '2026-08-11T09:00:00+08:00' }); const before = session.repository.read(); const externalBefore = bridge.orders()
    expect(() => session.service.startDeliveryTask(admin, delivery.id, delivery.version, 'delivery-batch-start')).toThrow('模拟第二张订单发货失败'); expect(session.repository.read()).toEqual(before); expect(bridge.orders()).toEqual(externalBefore); expect(bridge.shipmentCalls()).toBe(0)
  })

  it('enforces read-only and denied roles, immutable label source, idempotent fake printing and versions', () => {
    const { session } = sessionWith([order('label-a')]); expect(session.service.listPendingPickingOrders(supervisor).total).toBe(1); expect(() => session.service.createPickingTask(supervisor, 'label-a')).toThrowError(expect.objectContaining({ code: 'PERMISSION_DENIED' })); expect(() => session.service.listPendingPickingOrders(finance)).toThrowError(expect.objectContaining({ code: 'PERMISSION_DENIED' }))
    let task = session.service.createPickingTask(admin, 'label-a'); expect(() => session.service.startPickingTask(admin, task.id, 99, 'staff-picker')).toThrowError(expect.objectContaining({ code: 'CONFLICT' })); task = session.service.startPickingTask(admin, task.id, task.version, 'staff-picker'); task = session.service.submitPickingTask(admin, task.id, task.version, [{ lineId: task.lines[0]!.id, actualQuantityMilli: 5000 }])
    const label = session.service.createPickingLabel(admin, { sourceType: 'task', sourceId: task.id, type: 'order', orderId: 'label-a', quantityMilli: 1000, templateId: 'order-default' }); session.service.printPickingLabels(admin, [label.id], 2, 'label-print'); session.service.printPickingLabels(admin, [label.id], 2, 'label-print')
    expect(session.service.listPickingLabels(admin).items[0]?.printCount).toBe(2); expect(() => session.service.createPickingLabel(admin, { sourceType: 'task', sourceId: task.id, type: 'order', orderId: 'label-a', quantityMilli: 1000, templateId: 'order-default' })).toThrowError(expect.objectContaining({ code: 'DUPLICATE' }))
  })

  it('keeps independent route data usable during a partial Order-provider failure and exposes true empty state', () => {
    const partial = createInventoryMockSession('partial-failure'); partial.service.saveDeliveryRoute(admin, { name: '离线可维护线路', province: '山东省', city: '临沂市', district: '兰山区', stops: [{ name: '一号站', province: '山东省', city: '临沂市', district: '兰山区', address: '测试路 1 号' }], status: 'enabled' }); expect(partial.service.listDeliveryRoutes(admin).total).toBe(1); expect(() => partial.service.listPendingPickingOrders(admin)).toThrowError(expect.objectContaining({ code: 'DATA_PROVIDER_UNAVAILABLE' }))
    const empty = createInventoryMockSession('empty', { pickingOrderCoordinator: coordinator([]).api }); expect(empty.service.listPendingPickingOrders(admin).total).toBe(0); expect(empty.service.listDeliveryRoutes(admin).total).toBe(0)
  })
})
