import { describe, expect, it } from 'vitest'
import { createApplicationMockRuntime } from '../../../mock/runtime/application-mock-runtime'
import { createEmptyOrderDraft } from '../../features/orders/services/order-service'
import { applyBaseUnit, createEmptyProductDraft } from '../../features/products/services/product-service'
import type { OrderDraft } from '../../features/orders/types'
import type { PurchaseOrderDraft } from '../../features/procurement/types'

const admin = { role: 'super-admin' as const, actorId: 'admin-demo' }
const supervisor = { role: 'sales-supervisor' as const, actorId: 'sales-supervisor-demo' }
const warehouse = { role: 'warehouse' as const, actorId: 'warehouse-demo' }
const finance = { role: 'finance' as const, actorId: 'finance-demo' }

function salesDraft(): OrderDraft {
  const draft = createEmptyOrderDraft('2026-08-10T10:00:00+08:00', 'staff-demo-1')
  draft.customerId = 'customer-1'
  draft.warehouseId = 'warehouse-main'
  draft.requestedDeliveryAt = '2026-08-10T18:00:00+08:00'
  draft.deliveryMethod = 'logistics'
  draft.shipping = { recipient: '共享 Runtime 验收人', phone: '000-0000-0999', province: '演示省', city: '演示市', district: '演示区', address: '共享 Runtime 验收地址（虚构）' }
  draft.lines = [{ skuId: 'sku-1', unitId: 'unit-piece', quantity: 21, lineKind: 'sale', manualDealUnitPriceCents: null, reason: null, sourceKeys: [] }]
  return draft
}

function purchaseDraft(runtime: ReturnType<typeof createApplicationMockRuntime>): PurchaseOrderDraft {
  const supplier = runtime.procurement.service.listSuppliers(admin).items.find((item) => item.status === 'enabled' && item.deliveryMode !== 'direct')!
  const sku = runtime.procurement.service.getWorkspace(admin).skus.find((item) => item.productStatus === 'on-sale')!
  const relation = runtime.procurement.service.listSupplierProducts(admin, { supplierId: supplier.id }).find((item) => item.skuId === sku.skuId && item.status === 'enabled')!
  return { supplierId: supplier.id, warehouseId: 'warehouse-main', lines: [{ skuId: sku.skuId, supplierRelationId: relation.id, quantity: 2, unitPriceCents: relation.supplyPriceCents }], source: 'manual' }
}

function createSettledSale(runtime: ReturnType<typeof createApplicationMockRuntime>, suffix: string) {
  let order = runtime.order.service.saveOrder(admin, { requestId: `flow-sales-create-${suffix}`, draft: salesDraft() })
  order = runtime.order.service.reviewOrder(supervisor, { requestId: `flow-sales-business-review-${suffix}`, orderId: order.id, action: 'approve-order', expectedUpdatedAt: order.updatedAt })
  order = runtime.order.service.reviewOrder(finance, { requestId: `flow-sales-finance-review-${suffix}`, orderId: order.id, action: 'approve-finance', expectedUpdatedAt: order.updatedAt })

  const orderLine = order.lines[0]!
  const quantity = orderLine.quantityMilli / orderLine.unitSnapshot.conversionRateMilli
  const inventoryBefore = runtime.inventory.repository.read().balances.filter((item) => item.warehouseId === order.fulfillmentWarehouseSnapshot.id && item.skuId === orderLine.skuId).reduce((sum, item) => sum + item.quantityMilli, 0)
  const outboundResult = runtime.order.fulfillment.confirmOutbound(warehouse, { requestId: `flow-sales-outbound-${suffix}`, orderId: order.id, expectedUpdatedAt: order.updatedAt, warehouseId: order.fulfillmentWarehouseSnapshot.id, lines: [{ orderLineId: orderLine.id, quantity }], finishShort: false })
  order = runtime.order.repository.read().orders.find((item) => item.id === order.id)!
  const shipment = runtime.order.fulfillment.confirmShipment(warehouse, { requestId: `flow-sales-shipment-${suffix}`, orderId: order.id, expectedUpdatedAt: order.updatedAt, logisticsCode: `FLOW-LOGISTICS-${suffix}` })
  order = runtime.order.repository.read().orders.find((item) => item.id === order.id)!
  runtime.order.fulfillment.confirmReceipt(supervisor, { requestId: `flow-sales-sign-${suffix}`, orderId: order.id, expectedUpdatedAt: order.updatedAt, signedAt: '2026-08-10T10:00:00+08:00', signer: '共享 Runtime 验收人' })

  const receivable = runtime.finance.service.listReceivableDocuments(finance).find((item) => item.orderId === order.id)!
  const receiptResult = runtime.finance.service.createReceipt(finance, { requestId: `flow-sales-receipt-${suffix}`, customerSnapshot: receivable.customerSnapshot, orderId: order.id, occurredAt: '2026-08-10T10:00:00+08:00', amountCents: receivable.amountCents, method: 'cash', accountId: 'account-cash', note: '共享 Runtime 从零销售收款' })
  const writeoff = runtime.finance.service.createWriteoff(finance, { requestId: `flow-sales-writeoff-${suffix}`, customerId: receivable.customerSnapshot.id, occurredAt: '2026-08-10T10:00:00+08:00', allocations: [{ sourceKind: 'receipt', sourceId: receiptResult.receipt.id, receivableId: receivable.id, cashCents: receivable.amountCents, discountCents: 0 }], note: '共享 Runtime 从零销售核销' })
  return { order, orderLine, outbound: outboundResult.outbound!, shipment, receivable, receipt: receiptResult.receipt, writeoff, inventoryBefore }
}

describe('application shared Mock Runtime core flows', () => {
  it('makes a newly listed product SKU available for a supplier relationship', () => {
    const runtime = createApplicationMockRuntime()
    const draft = applyBaseUnit(createEmptyProductDraft(), 'unit-piece')
    draft.name = 'coco'
    draft.categoryId = 'product-category-drink'
    draft.skus[0]!.basePurchasePriceCents = 300
    draft.skus[0]!.baseOrderPriceCents = 500
    draft.skus[0]!.minimumSalePriceCents = 400
    draft.skus[0]!.maximumSalePriceCents = 700

    const created = runtime.product.service.createProduct(admin, draft)
    const listed = runtime.product.service.changeProductStatus(admin, created.id, 'on-sale')
    const sku = listed.skus[0]!
    const workspace = runtime.procurement.service.getWorkspace(admin)

    expect(workspace.skus).toEqual(expect.arrayContaining([
      expect.objectContaining({ skuId: sku.id, productName: 'coco', productStatus: 'on-sale' }),
    ]))

    const relation = runtime.procurement.service.createSupplierProduct(admin, {
      value: { supplierId: 'supplier-1', skuId: sku.id, supplyPriceCents: 300, preferred: false },
      expectedVersion: 0,
      requestId: 'flow-product-supplier-coco',
    })

    expect(runtime.procurement.service.listSupplierProducts(admin, { supplierId: 'supplier-1' })).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: relation.id, skuId: sku.id, productNameSnapshot: 'coco' })]),
    )
  })

  it('FLOW-PICKING-001 creates a door-delivery order from zero and crosses picking → outbound → shipment → receivable without auto receipt', () => {
    const runtime = createApplicationMockRuntime(); const draft = salesDraft(); draft.deliveryMethod = 'door-delivery'
    let order = runtime.order.service.saveOrder(admin, { requestId: 'flow-picking-create-001', draft })
    order = runtime.order.service.reviewOrder(supervisor, { requestId: 'flow-picking-business-review-001', orderId: order.id, action: 'approve-order', expectedUpdatedAt: order.updatedAt })
    order = runtime.order.service.reviewOrder(finance, { requestId: 'flow-picking-finance-review-001', orderId: order.id, action: 'approve-finance', expectedUpdatedAt: order.updatedAt })
    const balanceBefore = runtime.inventory.repository.read().balances.filter((item) => item.warehouseId === order.fulfillmentWarehouseSnapshot.id && item.skuId === order.lines[0]!.skuId).reduce((sum, item) => sum + item.quantityMilli, 0)
    let picking = runtime.inventory.service.createPickingTask(warehouse, order.id); picking = runtime.inventory.service.startPickingTask(warehouse, picking.id, picking.version, 'warehouse-demo')
    picking = runtime.inventory.service.submitPickingTask(warehouse, picking.id, picking.version, picking.lines.map((line) => ({ lineId: line.id, actualQuantityMilli: line.expectedQuantityMilli })))
    expect(runtime.inventory.repository.read().balances.filter((item) => item.warehouseId === order.fulfillmentWarehouseSnapshot.id && item.skuId === order.lines[0]!.skuId).reduce((sum, item) => sum + item.quantityMilli, 0)).toBe(balanceBefore)
    picking = runtime.inventory.service.confirmPickingOutbound(warehouse, picking.id, picking.version, 'flow-picking-outbound-001')
    const vehicle = runtime.inventory.service.saveDeliveryVehicle(warehouse, { plateNumber: '鲁QFLOW01', type: 'van', capacityKg: 1500, defaultDriverId: 'staff-demo-1', status: 'idle' })
    const route = runtime.inventory.service.saveDeliveryRoute(warehouse, { name: '从零验收线路', province: draft.shipping.province, city: draft.shipping.city, district: draft.shipping.district, stops: [{ name: draft.shipping.recipient, province: draft.shipping.province, city: draft.shipping.city, district: draft.shipping.district, address: draft.shipping.address }], defaultDriverId: 'staff-demo-1', defaultVehicleId: vehicle.id, estimatedMinutes: 45, status: 'enabled' })
    let delivery = runtime.inventory.service.createDeliveryTask(warehouse, { routeId: route.id, driverId: 'staff-demo-1', vehicleId: vehicle.id, orderIds: [order.id], plannedDepartureAt: '2026-08-11T09:00:00+08:00' })
    delivery = runtime.inventory.service.startDeliveryTask(warehouse, delivery.id, delivery.version, 'flow-picking-delivery-start-001')
    const current = runtime.order.repository.read().orders.find((item) => item.id === order.id)!; const receivable = runtime.finance.service.listReceivableDocuments(finance).find((item) => item.orderId === order.id)
    const balanceAfter = runtime.inventory.repository.read().balances.filter((item) => item.warehouseId === order.fulfillmentWarehouseSnapshot.id && item.skuId === order.lines[0]!.skuId).reduce((sum, item) => sum + item.quantityMilli, 0)
    expect(picking.outboundId).toBeTruthy(); expect(delivery.status).toBe('delivering'); expect(current.status).toBe('shipped'); expect(runtime.order.repository.read().receipts?.some((item) => item.orderId === order.id)).toBe(false); expect(receivable).toBeTruthy(); expect(balanceAfter).toBe(balanceBefore - order.lines[0]!.quantityMilli)
  })

  it('FLOW-PICKING-SHORT-001 creates one canonical Order difference for a zero pick and suppresses duplicate picking while it is pending', () => {
    const runtime = createApplicationMockRuntime(); const draft = salesDraft(); draft.deliveryMethod = 'door-delivery'; let order = runtime.order.service.saveOrder(admin, { requestId: 'flow-picking-short-create', draft }); order = runtime.order.service.reviewOrder(supervisor, { requestId: 'flow-picking-short-review', orderId: order.id, action: 'approve-order', expectedUpdatedAt: order.updatedAt }); order = runtime.order.service.reviewOrder(finance, { requestId: 'flow-picking-short-finance', orderId: order.id, action: 'approve-finance', expectedUpdatedAt: order.updatedAt })
    let task = runtime.inventory.service.createPickingTask(warehouse, order.id); task = runtime.inventory.service.startPickingTask(warehouse, task.id, task.version, 'warehouse-demo'); task = runtime.inventory.service.submitPickingTask(warehouse, task.id, task.version, task.lines.map((line) => ({ lineId: line.id, actualQuantityMilli: 0 })), '整单缺货')
    const difference = runtime.inventory.service.listPickingDifferences(warehouse).items.find((item) => item.ownerId === task.id)!; runtime.inventory.service.resolvePickingDifference(warehouse, difference.id, difference.version, 'accepted-short'); task = runtime.inventory.repository.read().pickingTasks!.find((item) => item.id === task.id)!; task = runtime.inventory.service.confirmPickingOutbound(warehouse, task.id, task.version, 'flow-picking-short-outbound')
    expect(task.outboundId).toBeNull(); expect(task.orderDifferenceId).toBeTruthy(); expect(runtime.order.repository.read().differences?.filter((item) => item.orderId === order.id)).toHaveLength(1); expect(runtime.inventory.service.listPendingPickingOrders(warehouse).items.some((item) => item.order.orderId === order.id)).toBe(false)
  })

  it('FLOW-SALES-001 creates one traceable order-to-writeoff chain in shared repositories', () => {
    const runtime = createApplicationMockRuntime()
    runtime.customer.repository.transact((state) => { state.customers.find((item) => item.id === 'customer-1')!.name = '共享客户甲' })
    runtime.product.repository.transact((state) => { state.products.find((item) => item.id === 'product-1')!.name = '共享商品甲' })
    const result = createSettledSale(runtime, '001')
    const inventoryAfter = runtime.inventory.repository.read().balances.filter((item) => item.warehouseId === result.order.fulfillmentWarehouseSnapshot.id && item.skuId === result.orderLine.skuId).reduce((sum, item) => sum + item.quantityMilli, 0)
    const settlement = runtime.finance.service.getOrderSettlement(result.order.id)!
    const customerSummary = runtime.finance.service.listCustomerReceivables(finance).find((item) => item.customer.id === result.order.customerSnapshot.id)!
    const orderFinancials = runtime.order.service.getOrderDetail(admin, result.order.id).financials

    expect(runtime.order.financeRepository).toBe(runtime.finance.repository)
    expect(runtime.order.inventoryRepository).toBe(runtime.inventory.repository)
    expect(result.order.customerSnapshot.name).toBe('共享客户甲')
    expect(result.orderLine.productNameSnapshot).toBe('共享商品甲')
    expect(result.outbound.orderId).toBe(result.order.id)
    expect(result.shipment.orderId).toBe(result.order.id)
    expect(result.receivable.orderId).toBe(result.order.id)
    expect(result.receipt.orderId).toBe(result.order.id)
    expect(result.writeoff.allocations[0]).toMatchObject({ sourceId: result.receipt.id, receivableId: result.receivable.id })
    expect(inventoryAfter).toBe(result.inventoryBefore - result.orderLine.quantityMilli)
    expect(settlement.receivable).toMatchObject({ receivedCents: result.receivable.amountCents, outstandingCents: 0, status: 'settled' })
    expect(orderFinancials.receivablesCents).toMatchObject({ state: 'available', value: customerSummary.outstandingCents })
  })

  it('FLOW-PURCHASE-001 creates one traceable purchase-to-payment-writeoff chain', () => {
    const runtime = createApplicationMockRuntime()
    let order = runtime.procurement.service.createPurchaseOrder(admin, { value: purchaseDraft(runtime), requestId: 'flow-purchase-create-001' })
    order = runtime.procurement.service.approvePurchaseOrder(admin, order.id, order.version, 'flow-purchase-review-001')
    const line = order.lines[0]!
    const location = runtime.inventory.repository.read().locations.find((item) => item.warehouseId === order.warehouseId && item.status === 'enabled')!
    const inventoryBefore = runtime.inventory.repository.read().balances.filter((item) => item.warehouseId === order.warehouseId && item.skuId === line.skuId).reduce((sum, item) => sum + item.quantityMilli, 0)
    order = runtime.procurement.service.receivePurchaseOrder(warehouse, { orderId: order.id, warehouseId: order.warehouseId, locationId: location.id, lines: [{ lineId: line.id, quantity: line.quantity, batchNumber: 'FLOW-PURCHASE-001', productionDate: '2026-08-10' }], requestId: 'flow-purchase-inbound-001', operatorId: warehouse.actorId, occurredAt: '2026-08-10T10:00:00+08:00' })
    const inbound = runtime.procurement.repository.read().purchaseInbounds!.find((item) => item.purchaseOrderId === order.id)!
    const payable = runtime.finance.service.listSupplierPayables(finance).find((item) => item.purchaseOrderId === order.id)!
    const payment = runtime.finance.service.createSupplierPayment(finance, { requestId: 'flow-purchase-payment-001', supplierSnapshot: payable.supplierSnapshot, occurredAt: '2026-08-10T10:00:00+08:00', amountCents: payable.amountCents, method: 'cash', accountId: 'account-cash', note: '共享 Runtime 从零采购付款' }).payment
    const writeoff = runtime.finance.service.createSupplierPaymentWriteoff(finance, { requestId: 'flow-purchase-writeoff-001', supplierId: payable.supplierSnapshot.id, occurredAt: '2026-08-10T10:00:00+08:00', allocations: [{ paymentId: payment.id, payableId: payable.id, amountCents: payable.amountCents }] })
    const inventoryAfter = runtime.inventory.repository.read().balances.filter((item) => item.warehouseId === order.warehouseId && item.skuId === line.skuId).reduce((sum, item) => sum + item.quantityMilli, 0)
    const settledPayable = runtime.finance.service.listSupplierPayables(finance).find((item) => item.id === payable.id)!

    expect(runtime.procurement.inventoryRepository).toBe(runtime.inventory.repository)
    expect(runtime.procurement.financeRepository).toBe(runtime.finance.repository)
    expect(inbound.purchaseOrderId).toBe(order.id)
    expect(payable.inboundId).toBe(inbound.id)
    expect(writeoff.allocations[0]).toMatchObject({ paymentId: payment.id, payableId: payable.id })
    expect(inventoryAfter).toBe(inventoryBefore + line.baseQuantityMilli)
    expect(settledPayable).toMatchObject({ paidCents: payable.amountCents, outstandingCents: 0, status: 'paid' })
  })

  it('FLOW-RETURN-001 returns stock and creates/refunds credit from a journey-created sale', () => {
    const runtime = createApplicationMockRuntime()
    const sale = createSettledSale(runtime, 'return-source')
    const returnable = runtime.order.returns.getReturnableLines(admin, sale.order.id)[0]!
    let customerReturn = runtime.order.returns.saveReturn(admin, { requestId: 'flow-return-create-001', draft: { orderId: sale.order.id, warehouseId: sale.order.fulfillmentWarehouseSnapshot.id, returnType: 'partial', refundPreference: 'original', reason: '共享 Runtime 验收退货', remark: null, priceAdjustmentReason: null, lines: [{ orderLineId: returnable.line.id, returnQuantityMilli: returnable.returnableQuantityMilli }] } })
    customerReturn = runtime.order.returns.reviewReturn(supervisor, { requestId: 'flow-return-review-001', returnId: customerReturn.id, expectedVersion: customerReturn.version, action: 'approve' })
    const inventoryBefore = runtime.inventory.repository.read().balances.reduce((sum, item) => sum + item.quantityMilli, 0)
    const location = runtime.inventory.repository.read().locations.find((item) => item.warehouseId === customerReturn.warehouseSnapshot.id && item.status === 'enabled')!
    customerReturn = runtime.order.returnCoordinator.confirmInbound(warehouse, { requestId: 'flow-return-inbound-001', returnId: customerReturn.id, expectedVersion: customerReturn.version, locationId: location.id })
    const financeResult = runtime.order.financeRefunds.getSourceResult('customer-return', customerReturn.id)!
    const refund = financeResult.refunds[0]!
    runtime.order.financeRefunds.confirmRefund(finance, { requestId: 'flow-return-refund-001', refundId: refund.id, expectedVersion: refund.version, method: 'original', occurredAt: '2026-08-10T10:00:00+08:00' })
    customerReturn = runtime.order.returnCoordinator.refreshRefundProjection(customerReturn.id)
    const inventoryAfter = runtime.inventory.repository.read().balances.reduce((sum, item) => sum + item.quantityMilli, 0)

    expect(customerReturn.returnNo).toBe('TH-260810-00007')
    expect(customerReturn.orderId).toBe(sale.order.id)
    expect(customerReturn.inboundProjection?.movementIds.length).toBeGreaterThan(0)
    expect(financeResult.credit).toMatchObject({ sourceId: customerReturn.id, orderId: sale.order.id, amountCents: customerReturn.returnAmountCents })
    expect(inventoryAfter - inventoryBefore).toBe(customerReturn.items.reduce((sum, item) => sum + item.returnQuantityMilli, 0))
    expect(customerReturn).toMatchObject({ receivingStatus: 'received', refundStatus: 'refunded', status: 'completed' })
  })
})
