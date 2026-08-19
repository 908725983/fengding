import type { CustomerOrder, CustomerReturn, OrderLine, OrderFeatureState, SalesOutbound } from '../types'
import type { OrderRepository } from '../repositories/order-repository'
import { OrderDomainError } from '../services/order-service'
import { normalizeOrderStatisticsQuery } from './schema'
import type {
  OrderStatisticsAccess, OrderStatisticsActor, OrderStatisticsFilterOptions, OrderStatisticsPage, OrderStatisticsQuery, OrderStatisticsReportKey,
  OrderStatisticsRow, StatisticsDocumentKind, StatisticsProductSnapshot, StatisticsUnitMode, StatisticsUnitSnapshot,
} from './types'

export interface OrderStatisticsServiceDependencies { repository: OrderRepository; now: () => string }

const presaleReports = new Set<OrderStatisticsReportKey>(['presale-line-detail', 'presale-by-product'])
const movementReports = new Set<OrderStatisticsReportKey>(['movement-line-detail', 'movement-by-product', 'movement-by-customer'])
const detailReports = new Set<OrderStatisticsReportKey>(['order-line-detail', 'return-line-detail', 'movement-line-detail'])
const summaryReports = new Set<OrderStatisticsReportKey>(['order-by-product', 'order-by-customer', 'movement-by-product', 'movement-by-customer'])

export function getOrderStatisticsAccess(actor: OrderStatisticsActor, report: OrderStatisticsReportKey): OrderStatisticsAccess {
  const explicit = actor.statisticsPermissions
  const movement = movementReports.has(report)
  let canView = actor.role !== 'warehouse' || movement
  if (explicit) {
    const required = report === 'order-line-detail' ? 'orders.view-order-line-statistics'
      : report === 'return-line-detail' ? 'orders.view-return-line-statistics'
        : report === 'order-by-product' || report === 'order-by-customer' ? (report.startsWith('order') ? 'orders.view-order-summary-statistics' : 'orders.view-return-summary-statistics')
          : 'orders.view-statistics'
    canView = explicit.includes('orders.view-statistics') && (movement || presaleReports.has(report) || explicit.includes(required))
  }
  const canExport = canView && (explicit ? explicit.includes('orders.export-statistics') : ['super-admin', 'sales-supervisor', 'finance'].includes(actor.role))
  return { canView, canExport, amountsVisible: actor.role !== 'warehouse' }
}

function assertView(actor: OrderStatisticsActor, report: OrderStatisticsReportKey): OrderStatisticsAccess {
  const access = getOrderStatisticsAccess(actor, report)
  if (!access.canView) throw new OrderDomainError('PERMISSION_DENIED', '当前角色不可查看该统计报表')
  return access
}

function lineProduct(line: OrderLine): StatisticsProductSnapshot {
  return {
    spuId: line.spuId, skuId: line.skuId, productCode: line.productCodeSnapshot, skuCode: line.skuCodeSnapshot,
    name: line.productNameSnapshot, specification: line.specificationSnapshot, image: line.imageSnapshot,
    barcode: null, barcodeState: 'unavailable', physicalCode: null, physicalCodeState: 'unavailable',
  }
}

const baseUnit = (skuId: string): StatisticsUnitSnapshot => ({ id: `base:${skuId}`, name: '基本单位', conversionRateMilli: 1000 })
const displayQuantity = (baseQuantityMilli: number, unit: StatisticsUnitSnapshot) => Math.round(baseQuantityMilli * 1000 / unit.conversionRateMilli)
const clampRate = (numerator: number, denominator: number) => denominator === 0 ? null : Math.max(0, Math.min(10000, Math.round(numerator * 10000 / denominator)))
const clean = (value: string) => value.trim().toLocaleLowerCase()
const dateKey = (value: string) => value.slice(0, 10)

function allocateOrderDiscount(order: CustomerOrder): Map<string, number> {
  const result = new Map<string, number>()
  const discount = Math.max(0, -(order.amounts.orderDiscountCents ?? 0))
  const eligible = order.lines.filter((line) => (line.lineKind ?? 'sale') !== 'gift')
  const denominator = eligible.reduce((sum, line) => sum + line.subtotalCents, 0)
  let cumulative = 0; let allocated = 0
  for (const line of order.lines) {
    if ((line.lineKind ?? 'sale') === 'gift' || denominator === 0) { result.set(line.id, 0); continue }
    cumulative += line.subtotalCents
    const next = Math.min(discount, Math.floor(discount * cumulative / denominator))
    result.set(line.id, next - allocated); allocated = next
  }
  return result
}

function outboundQuantityByLine(state: OrderFeatureState): Map<string, number> {
  const values = new Map<string, number>()
  for (const outbound of state.outbounds ?? []) if (outbound.status === 'confirmed') for (const line of outbound.lines) values.set(line.orderLineId, (values.get(line.orderLineId) ?? 0) + line.quantityMilli)
  return values
}

function baseRow(order: CustomerOrder, line: OrderLine, unitMode: StatisticsUnitMode, access: OrderStatisticsAccess): Omit<OrderStatisticsRow, 'id' | 'rowKind' | 'occurredAt' | 'documentId' | 'documentNo' | 'documentType' | 'documentStatus' | 'movementType' | 'baseQuantityMilli' | 'displayQuantityMilli' | 'pendingDisplayQuantityMilli' | 'originalAmountCents' | 'discountAmountCents' | 'amountCents' | 'averageUnitPriceCents' | 'fulfillmentRateBasisPoints' | 'discountRateBasisPoints' | 'documentCount' | 'sourcePath'> {
  return {
    customerId: order.customerSnapshot.id, customerCode: order.customerSnapshot.code, customerName: order.customerSnapshot.name,
    salespersonId: order.salespersonSnapshot.id, product: lineProduct(line), unit: unitMode === 'ordered' ? structuredClone(line.unitSnapshot) : baseUnit(line.skuId),
    packageName: null, packageState: 'unavailable', amountState: access.amountsVisible ? 'available' : 'unavailable',
  }
}

function orderRows(state: OrderFeatureState, access: OrderStatisticsAccess, unitMode: StatisticsUnitMode): OrderStatisticsRow[] {
  const outbound = outboundQuantityByLine(state)
  return state.orders.filter((order) => order.deletedAt === null && order.status !== 'canceled').flatMap((order) => {
    const allocation = allocateOrderDiscount(order)
    return order.lines.map((line): OrderStatisticsRow => {
      const allocated = allocation.get(line.id) ?? 0
      const net = Math.max(0, line.subtotalCents - allocated)
      const original = Math.round(line.quantityMilli / line.unitSnapshot.conversionRateMilli) * line.originalUnitPriceCents
      const effective = Math.min(line.quantityMilli, outbound.get(line.id) ?? 0)
      const common = baseRow(order, line, unitMode, access)
      const display = displayQuantity(line.quantityMilli, common.unit)
      return {
        ...common, id: `order:${order.id}:${line.id}`, rowKind: 'order-line', occurredAt: order.orderedAt, documentId: order.id,
        documentNo: order.orderNo, documentType: 'customer-order', documentStatus: order.status, movementType: null,
        baseQuantityMilli: line.quantityMilli, displayQuantityMilli: display,
        pendingDisplayQuantityMilli: displayQuantity(Math.max(0, line.quantityMilli - effective), common.unit),
        originalAmountCents: access.amountsVisible ? original : null, discountAmountCents: access.amountsVisible ? Math.max(0, original - net) : null,
        amountCents: access.amountsVisible ? net : null, averageUnitPriceCents: access.amountsVisible && display !== 0 ? Math.round(net * 1000 / display) : null,
        fulfillmentRateBasisPoints: clampRate(effective, line.quantityMilli), discountRateBasisPoints: access.amountsVisible ? clampRate(net, original) : null,
        documentCount: 1, sourcePath: `/orders/${order.id}`,
      }
    })
  })
}

function findOrderLine(state: OrderFeatureState, value: CustomerReturn, orderLineId: string): { order: CustomerOrder; line: OrderLine } | null {
  const order = state.orders.find((item) => item.id === value.orderId)
  const line = order?.lines.find((item) => item.id === orderLineId)
  return order && line ? { order, line } : null
}

function returnRows(state: OrderFeatureState, access: OrderStatisticsAccess, unitMode: StatisticsUnitMode): OrderStatisticsRow[] {
  return (state.returns ?? []).filter((value) => value.sourceKind === 'customer-return' && value.status !== 'cancelled').flatMap((value) => value.items.map((item): OrderStatisticsRow => {
    const source = findOrderLine(state, value, item.orderLineId)
    const sourceLine: OrderLine = source?.line ?? {
      id: item.orderLineId, sequence: 1, spuId: '', skuId: item.skuId, productCodeSnapshot: '', productNameSnapshot: item.productNameSnapshot,
      skuCodeSnapshot: item.skuCodeSnapshot, specificationSnapshot: item.specificationSnapshot, imageSnapshot: null, unitSnapshot: item.unitSnapshot,
      quantityMilli: item.returnQuantityMilli, discountBasisPoints: 10000, originalUnitPriceCents: item.originalDealUnitPriceCents,
      dealUnitPriceCents: item.originalDealUnitPriceCents, subtotalCents: item.defaultReturnAmountCents + item.allocatedOrderDiscountCents,
      weightSubtotalGrams: null, reason: null, lineKind: item.lineKind,
    }
    const order = source?.order ?? state.orders.find((entry) => entry.id === value.orderId)!
    const common = baseRow(order, sourceLine, unitMode, access)
    const received = value.receivingStatus === 'received' && value.inboundProjection?.voidInfo === null ? item.returnQuantityMilli : 0
    const display = displayQuantity(item.returnQuantityMilli, common.unit)
    const original = source?.line ? Math.round(item.returnQuantityMilli / source.line.unitSnapshot.conversionRateMilli) * source.line.originalUnitPriceCents : item.defaultReturnAmountCents + item.allocatedOrderDiscountCents
    return {
      ...common, id: `return:${value.id}:${item.id}`, rowKind: 'return-line', occurredAt: value.createdAt, documentId: value.id,
      documentNo: value.returnNo, documentType: 'customer-return', documentStatus: value.status, movementType: null,
      baseQuantityMilli: item.returnQuantityMilli, displayQuantityMilli: display,
      pendingDisplayQuantityMilli: displayQuantity(Math.max(0, item.returnQuantityMilli - received), common.unit),
      originalAmountCents: access.amountsVisible ? original : null, discountAmountCents: access.amountsVisible ? Math.max(0, original - item.returnAmountCents) : null,
      amountCents: access.amountsVisible ? item.returnAmountCents : null, averageUnitPriceCents: access.amountsVisible && display !== 0 ? Math.round(item.returnAmountCents * 1000 / display) : null,
      fulfillmentRateBasisPoints: clampRate(received, item.returnQuantityMilli), discountRateBasisPoints: access.amountsVisible ? clampRate(item.returnAmountCents, original) : null,
      documentCount: 1, sourcePath: `/orders/returns/${value.id}`,
    }
  }))
}

function movementRows(state: OrderFeatureState, access: OrderStatisticsAccess): OrderStatisticsRow[] {
  const rows: OrderStatisticsRow[] = []
  const orders = new Map(state.orders.map((order) => [order.id, order]))
  const allocations = new Map(state.orders.map((order) => [order.id, allocateOrderDiscount(order)]))
  const cumulative = new Map<string, number>()
  const priorNet = new Map<string, number>()
  const outbounds = [...(state.outbounds ?? [])].filter((value) => value.status === 'confirmed').sort((a, b) => a.confirmedAt.localeCompare(b.confirmedAt) || a.id.localeCompare(b.id))
  for (const outbound of outbounds) {
    const order = orders.get(outbound.orderId); if (!order) continue
    for (const line of outbound.lines) {
      const source = order.lines.find((item) => item.id === line.orderLineId); if (!source) continue
      const fullNet = Math.max(0, source.subtotalCents - (allocations.get(order.id)?.get(source.id) ?? 0))
      const nextQuantity = Math.min(source.quantityMilli, (cumulative.get(source.id) ?? 0) + line.quantityMilli)
      const nextNet = source.quantityMilli === 0 ? 0 : Math.floor(fullNet * nextQuantity / source.quantityMilli)
      const amount = Math.max(0, nextNet - (priorNet.get(source.id) ?? 0)); cumulative.set(source.id, nextQuantity); priorNet.set(source.id, nextNet)
      const unit = baseUnit(source.skuId); const common = baseRow(order, source, 'base', access)
      rows.push({ ...common, unit, id: `movement:out:${outbound.id}:${line.id}`, rowKind: 'movement', occurredAt: outbound.confirmedAt,
        documentId: outbound.id, documentNo: outbound.outboundNo, documentType: 'sales-outbound', documentStatus: outbound.status, movementType: 'sales-outbound',
        baseQuantityMilli: line.quantityMilli, displayQuantityMilli: line.quantityMilli, pendingDisplayQuantityMilli: null,
        originalAmountCents: access.amountsVisible ? amount : null, discountAmountCents: access.amountsVisible ? 0 : null,
        amountCents: access.amountsVisible ? amount : null, averageUnitPriceCents: access.amountsVisible && line.quantityMilli !== 0 ? Math.round(amount * 1000 / line.quantityMilli) : null,
        fulfillmentRateBasisPoints: null, discountRateBasisPoints: null, documentCount: 1, sourcePath: `/orders/outbounds/${outbound.id}` })
    }
  }
  for (const value of state.returns ?? []) {
    if (value.sourceKind !== 'customer-return' || value.receivingStatus !== 'received' || !value.inboundProjection || value.inboundProjection.voidInfo !== null) continue
    const order = orders.get(value.orderId); if (!order) continue
    for (const item of value.items) {
      const source = order.lines.find((line) => line.id === item.orderLineId); if (!source) continue
      const common = baseRow(order, source, 'base', access)
      rows.push({ ...common, unit: baseUnit(source.skuId), id: `movement:return:${value.id}:${item.id}`, rowKind: 'movement', occurredAt: value.inboundProjection.receivedAt,
        documentId: value.id, documentNo: value.inboundProjection.sourceNo, documentType: 'return-inbound', documentStatus: value.status, movementType: 'customer-return-inbound',
        baseQuantityMilli: -item.returnQuantityMilli, displayQuantityMilli: -item.returnQuantityMilli, pendingDisplayQuantityMilli: null,
        originalAmountCents: access.amountsVisible ? -item.returnAmountCents : null, discountAmountCents: access.amountsVisible ? 0 : null,
        amountCents: access.amountsVisible ? -item.returnAmountCents : null, averageUnitPriceCents: access.amountsVisible && item.returnQuantityMilli !== 0 ? Math.round(item.returnAmountCents * 1000 / item.returnQuantityMilli) : null,
        fulfillmentRateBasisPoints: null, discountRateBasisPoints: null, documentCount: 1, sourcePath: `/orders/returns/${value.id}` })
    }
  }
  return rows
}

function applyFilters(rows: OrderStatisticsRow[], query: ReturnType<typeof normalizeOrderStatisticsQuery>, actor: OrderStatisticsActor): OrderStatisticsRow[] {
  const keyword = query.keyword ? clean(query.keyword) : null
  return rows.filter((row) => actor.role !== 'salesperson' || row.salespersonId === actor.actorId)
    .filter((row) => dateKey(row.occurredAt) >= query.fromDate && dateKey(row.occurredAt) <= query.toDate)
    .filter((row) => !query.customerId || row.customerId === query.customerId)
    .filter((row) => !query.skuId || row.product.skuId === query.skuId)
    .filter((row) => !keyword || [row.documentNo, row.customerCode, row.customerName, row.product.productCode, row.product.skuCode, row.product.name, row.product.barcode].some((value) => value && clean(value).includes(keyword)))
    .filter((row) => !query.orderStatuses?.length || row.documentType !== 'customer-order' || query.orderStatuses.includes(row.documentStatus as never))
    .filter((row) => !query.returnStatuses?.length || row.documentType !== 'customer-return' || query.returnStatuses.includes(row.documentStatus as never))
}

function aggregate(rows: OrderStatisticsRow[], report: OrderStatisticsReportKey, unitMode: StatisticsUnitMode): OrderStatisticsRow[] {
  const groups = new Map<string, OrderStatisticsRow[]>()
  for (const row of rows) {
    const key = report === 'order-by-customer' || report === 'movement-by-customer'
      ? `${row.customerId}:${row.product.skuId}:${unitMode === 'ordered' ? row.unit.id : 'base'}`
      : `${row.product.skuId}:${unitMode === 'ordered' ? row.unit.id : 'base'}`
    const values = groups.get(key) ?? []; values.push(row); groups.set(key, values)
  }
  return [...groups.entries()].map(([key, values]) => {
    const first = values[0]!
    const baseQuantityMilli = values.reduce((sum, item) => sum + item.baseQuantityMilli, 0)
    const displayQuantityMilli = values.reduce((sum, item) => sum + item.displayQuantityMilli, 0)
    const pendingValues = values.map((item) => item.pendingDisplayQuantityMilli).filter((item): item is number => item !== null)
    const amountAvailable = values.every((item) => item.amountState === 'available' && item.amountCents !== null)
    const original = amountAvailable ? values.reduce((sum, item) => sum + (item.originalAmountCents ?? 0), 0) : null
    const amount = amountAvailable ? values.reduce((sum, item) => sum + (item.amountCents ?? 0), 0) : null
    const discount = amountAvailable ? values.reduce((sum, item) => sum + (item.discountAmountCents ?? 0), 0) : null
    const documents = new Set(values.map((item) => item.documentId).filter(Boolean))
    const pending = pendingValues.length ? pendingValues.reduce((sum, item) => sum + item, 0) : null
    return { ...first, id: `summary:${report}:${key}`, rowKind: 'summary' as const, occurredAt: values.map((item) => item.occurredAt).sort().at(-1)!,
      documentId: null, documentNo: null, documentType: 'summary' as const, documentStatus: null, movementType: null,
      baseQuantityMilli, displayQuantityMilli, pendingDisplayQuantityMilli: pending, originalAmountCents: original,
      discountAmountCents: discount, amountCents: amount, averageUnitPriceCents: amount !== null && displayQuantityMilli !== 0 ? Math.round(Math.abs(amount) * 1000 / Math.abs(displayQuantityMilli)) : null,
      fulfillmentRateBasisPoints: pending !== null ? clampRate(Math.max(0, displayQuantityMilli - pending), displayQuantityMilli) : null,
      discountRateBasisPoints: amount !== null && original !== null ? clampRate(amount, original) : null, documentCount: documents.size,
      packageName: null, packageState: 'unavailable' as const, amountState: amountAvailable ? 'available' as const : 'unavailable' as const, sourcePath: null }
  })
}

function snapshotVersion(state: OrderFeatureState): string {
  const timestamps = [...state.orders.map((item) => item.updatedAt), ...(state.returns ?? []).map((item) => item.updatedAt), ...(state.outbounds ?? []).map((item) => item.voidInfo?.voidedAt ?? item.confirmedAt)].sort()
  return `ordstat-${state.orders.length}-${state.outbounds?.length ?? 0}-${state.returns?.length ?? 0}-${timestamps.at(-1) ?? 'empty'}`
}

function sourceRows(state: OrderFeatureState, access: OrderStatisticsAccess, query: ReturnType<typeof normalizeOrderStatisticsQuery>): OrderStatisticsRow[] {
  if (movementReports.has(query.report)) return movementRows(state, access)
  const kind: StatisticsDocumentKind = query.report === 'return-line-detail' ? 'return' : query.report === 'order-line-detail' ? 'order' : query.documentKind
  return kind === 'return' ? returnRows(state, access, query.unitMode) : orderRows(state, access, query.unitMode)
}

export function createOrderStatisticsService(deps: OrderStatisticsServiceDependencies) {
  function build(actor: OrderStatisticsActor, input: OrderStatisticsQuery): { page: OrderStatisticsPage; all: OrderStatisticsRow[] } {
    const query = normalizeOrderStatisticsQuery(input, deps.now())
    const access = assertView(actor, query.report)
    const state = deps.repository.read()
    if (presaleReports.has(query.report)) return { page: { report: query.report, availability: 'unavailable', message: '预售业务尚未接入：不使用普通订单伪造预售、定金或转化率数据。', query, items: [], total: 0, totals: { documentCount: 0, baseQuantityMilli: 0, amountCents: null, amountState: 'unavailable' }, snapshotVersion: snapshotVersion(state) }, all: [] }
    let rows = applyFilters(sourceRows(state, access, query), query, actor)
    if (summaryReports.has(query.report)) rows = aggregate(rows, query.report, query.unitMode)
    rows.sort((a, b) => detailReports.has(query.report)
      ? b.occurredAt.localeCompare(a.occurredAt) || (b.documentId ?? '').localeCompare(a.documentId ?? '') || b.id.localeCompare(a.id)
      : Math.abs(b.amountCents ?? 0) - Math.abs(a.amountCents ?? 0) || a.product.skuCode.localeCompare(b.product.skuCode) || a.id.localeCompare(b.id))
    const documents = new Set(rows.flatMap((row) => row.documentId ? [row.documentId] : []))
    const amountAvailable = rows.every((row) => row.amountState === 'available' && row.amountCents !== null)
    const totals = { documentCount: summaryReports.has(query.report) ? rows.reduce((sum, row) => sum + row.documentCount, 0) : documents.size,
      baseQuantityMilli: rows.reduce((sum, row) => sum + row.baseQuantityMilli, 0), amountCents: amountAvailable ? rows.reduce((sum, row) => sum + (row.amountCents ?? 0), 0) : null,
      amountState: amountAvailable ? 'available' as const : 'unavailable' as const }
    const start = (query.page - 1) * query.pageSize
    return { page: { report: query.report, availability: 'available', message: null, query, items: structuredClone(rows.slice(start, start + query.pageSize)), total: rows.length, totals, snapshotVersion: snapshotVersion(state) }, all: rows }
  }
  function query(actor: OrderStatisticsActor, input: OrderStatisticsQuery): OrderStatisticsPage { return build(actor, input).page }
  function exportCsv(actor: OrderStatisticsActor, input: OrderStatisticsQuery): string {
    const access = assertView(actor, input.report)
    if (!access.canExport) throw new OrderDomainError('PERMISSION_DENIED', '当前角色不可导出统计报表')
    const { page, all } = build(actor, input)
    if (page.availability === 'unavailable') throw new OrderDomainError('DATA_PROVIDER_UNAVAILABLE', page.message ?? '报表暂不可用')
    const headers = ['occurredAt', 'documentNo', 'documentType', 'documentStatus', 'customerCode', 'customerName', 'skuCode', 'productName', 'specification', 'unit', 'quantityMilli', 'pendingQuantityMilli', 'documentCount', 'amountCents', 'averageUnitPriceCents', 'fulfillmentRateBasisPoints', 'discountRateBasisPoints', 'barcode', 'physicalCode', 'packageName']
    const csv = all.map((row) => [row.occurredAt, row.documentNo ?? '—', row.documentType, row.documentStatus ?? '—', row.customerCode, row.customerName, row.product.skuCode, row.product.name, row.product.specification, row.unit.name, row.displayQuantityMilli, row.pendingDisplayQuantityMilli ?? '—', row.documentCount, row.amountCents ?? 'unavailable', row.averageUnitPriceCents ?? 'unavailable', row.fulfillmentRateBasisPoints ?? 'unavailable', row.discountRateBasisPoints ?? 'unavailable', row.product.barcode ?? 'unavailable', row.product.physicalCode ?? 'unavailable', row.packageName ?? 'unavailable'].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(','))
    return `\uFEFF${[headers.join(','), ...csv].join('\r\n')}`
  }
  function listFilterOptions(actor: OrderStatisticsActor, report: OrderStatisticsReportKey): OrderStatisticsFilterOptions {
    assertView(actor, report)
    const state = deps.repository.read()
    const visibleOrders = state.orders.filter((order) => order.deletedAt === null && order.status !== 'canceled' && (actor.role !== 'salesperson' || order.salespersonSnapshot.id === actor.actorId))
    const customers = [...new Map(visibleOrders.map((order) => [order.customerSnapshot.id, { id: order.customerSnapshot.id, code: order.customerSnapshot.code, name: order.customerSnapshot.name }])).values()].sort((a, b) => a.code.localeCompare(b.code))
    const products = [...new Map(visibleOrders.flatMap((order) => order.lines.map((line) => [line.skuId, { skuId: line.skuId, skuCode: line.skuCodeSnapshot, name: line.productNameSnapshot, specification: line.specificationSnapshot }] as const))).values()].sort((a, b) => a.skuCode.localeCompare(b.skuCode))
    return { customers, products }
  }
  return { query, exportCsv, listFilterOptions, getAccess: (actor: OrderStatisticsActor, report: OrderStatisticsReportKey) => getOrderStatisticsAccess(actor, report) }
}
