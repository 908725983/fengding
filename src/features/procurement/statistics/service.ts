import type { ProcurementFeatureState, PurchaseInboundRecordLine, PurchaseOrder, PurchaseOrderLine, PurchaseReturnLine } from '../types'
import type { ProcurementRepository } from '../repositories/procurement-repository'
import { ProcurementDomainError } from '../services/procurement-service'
import { normalizePurchaseStatisticsQuery, type PurchaseStatisticsPageQuery } from './schema'
import type {
  PurchaseStatisticsAccess, PurchaseStatisticsActor, PurchaseStatisticsFilterOptions, PurchaseStatisticsPage,
  PurchaseStatisticsQuery, PurchaseStatisticsReportKey, PurchaseStatisticsRow, PurchaseStatisticsTotals,
} from './types'

export interface PurchaseStatisticsServiceDependencies { repository: ProcurementRepository; now(): string; unavailableMessage?: string | null }

const orderReports = new Set<PurchaseStatisticsReportKey>(['purchase-order-line-detail', 'purchase-order-by-supplier'])
const summaryReports = new Set<PurchaseStatisticsReportKey>(['purchase-order-by-supplier', 'purchase-movement-by-product', 'purchase-movement-by-supplier'])
const normalize = (value: string) => value.trim().toLocaleLowerCase()
const datePart = (value: string) => value.slice(0, 10)

export function getPurchaseStatisticsAccess(actor: PurchaseStatisticsActor): PurchaseStatisticsAccess {
  const canView = ['super-admin', 'warehouse', 'sales-supervisor'].includes(actor.role)
  return { canView, canExport: actor.role === 'super-admin' || actor.role === 'warehouse', amountsVisible: canView }
}

function assertView(actor: PurchaseStatisticsActor): PurchaseStatisticsAccess {
  const access = getPurchaseStatisticsAccess(actor)
  if (!access.canView) throw new ProcurementDomainError('PROCUREMENT_PERMISSION_DENIED', '当前角色无权查看采购统计')
  return access
}

type StatisticsSourceLine = PurchaseOrderLine | PurchaseReturnLine | PurchaseInboundRecordLine
function product(line: StatisticsSourceLine) {
  return {
    skuId: line.skuId, productCode: line.productCodeSnapshot, skuCode: line.skuCodeSnapshot, name: line.productNameSnapshot,
    specification: line.specificationSnapshot, barcode: line.barcodeSnapshot ?? null,
    barcodeState: line.barcodeSnapshot === undefined ? 'unavailable' as const : 'available' as const,
    categoryId: line.categoryIdSnapshot ?? null, categoryName: line.categoryNameSnapshot ?? null,
    categoryState: line.categoryNameSnapshot === undefined ? 'unavailable' as const : 'available' as const,
  }
}

function unit(line: StatisticsSourceLine) {
  return {
    baseUnitId: line.baseUnitIdSnapshot ?? null, baseUnitName: line.baseUnitNameSnapshot ?? null,
    baseUnitState: line.baseUnitNameSnapshot === undefined ? 'unavailable' as const : 'available' as const,
    procurementUnitId: line.procurementUnitId, procurementUnitName: line.procurementUnitNameSnapshot,
    procurementUnitRateMilli: line.procurementUnitRateMilli,
  }
}

function allocateOrderAmounts(order: PurchaseOrder): Map<string, number> {
  const result = new Map<string, number>(); const eligible = order.lines.filter((line) => !line.isGift); const original = eligible.reduce((sum, line) => sum + line.amountCents, 0)
  let discountAssigned = 0; let feeAssigned = 0
  eligible.forEach((line, index) => {
    const last = index === eligible.length - 1
    const discount = last ? order.productDiscountCents - discountAssigned : original === 0 ? 0 : Math.floor(order.productDiscountCents * line.amountCents / original)
    const fee = last ? order.otherFeeCents - feeAssigned : original === 0 ? 0 : Math.floor(order.otherFeeCents * line.amountCents / original)
    discountAssigned += discount; feeAssigned += fee; result.set(line.id, line.amountCents - discount + fee)
  })
  for (const line of order.lines) if (line.isGift) result.set(line.id, 0)
  return result
}

function orderRows(state: ProcurementFeatureState, access: PurchaseStatisticsAccess): PurchaseStatisticsRow[] {
  return (state.purchaseOrders ?? []).filter((order) => order.workflowStatus === 'pending-review' || order.workflowStatus === 'approved').flatMap((order) => {
    const supplier = state.suppliers.find((item) => item.id === order.supplierId); const amounts = allocateOrderAmounts(order)
    return order.lines.map((line) => ({
      id: `order:${order.id}:${line.id}`, rowKind: 'order-line' as const, occurredAt: order.createdAt, documentId: order.id,
      documentNo: order.code, sourceDocumentId: order.id, sourceDocumentNo: order.code, documentStatus: order.workflowStatus, movementType: null,
      supplierId: order.supplierId, supplierCode: supplier?.code ?? null, supplierName: order.supplierNameSnapshot,
      warehouseId: order.warehouseId, warehouseName: order.warehouseNameSnapshot ?? null,
      warehouseState: order.warehouseNameSnapshot === undefined ? 'unavailable' as const : 'available' as const,
      product: product(line), unit: unit(line), packageQuantity: line.quantity, baseQuantityMilli: line.baseQuantityMilli,
      pendingPackageQuantity: Math.max(0, line.quantity - line.receivedQuantity), pendingBaseQuantityMilli: Math.max(0, line.baseQuantityMilli - line.receivedBaseQuantityMilli),
      unitPriceCents: access.amountsVisible ? line.unitPriceCents : null, amountCents: access.amountsVisible ? amounts.get(line.id) ?? 0 : null,
      amountState: access.amountsVisible ? 'available' as const : 'unavailable' as const, documentCount: 1, sourcePath: '/procurement/purchase-orders',
    }))
  })
}

function movementRows(state: ProcurementFeatureState, access: PurchaseStatisticsAccess): PurchaseStatisticsRow[] {
  const rows: PurchaseStatisticsRow[] = []
  for (const inbound of state.purchaseInbounds ?? []) for (const line of inbound.lines) rows.push({
    id: `movement:in:${inbound.id}:${line.id}`, rowKind: 'movement', occurredAt: inbound.occurredAt, documentId: inbound.id,
    documentNo: inbound.code, sourceDocumentId: inbound.purchaseOrderId, sourceDocumentNo: inbound.purchaseOrderCodeSnapshot,
    documentStatus: 'confirmed', movementType: 'purchase-inbound', supplierId: inbound.supplierId, supplierCode: inbound.supplierCodeSnapshot,
    supplierName: inbound.supplierNameSnapshot, warehouseId: inbound.warehouseId, warehouseName: inbound.warehouseNameSnapshot,
    warehouseState: inbound.warehouseNameSnapshot === null ? 'unavailable' : 'available', product: product(line), unit: unit(line),
    packageQuantity: line.quantity, baseQuantityMilli: line.baseQuantityMilli, pendingPackageQuantity: null, pendingBaseQuantityMilli: null,
    unitPriceCents: access.amountsVisible ? line.unitPriceCents : null, amountCents: access.amountsVisible ? line.amountCents : null,
    amountState: access.amountsVisible ? 'available' : 'unavailable', documentCount: 1, sourcePath: '/procurement/purchase-orders',
  })
  for (const value of state.purchaseReturns ?? []) for (const shipment of value.shipments) for (const shipped of shipment.lines) {
    const line = value.lines.find((item) => item.id === shipped.lineId); if (!line) continue
    const amount = shipment.credits.filter((item) => item.lineId === line.id).reduce((sum, item) => sum + item.amountCents, 0)
    rows.push({ id: `movement:out:${shipment.id}:${line.id}`, rowKind: 'movement', occurredAt: shipment.occurredAt, documentId: shipment.id,
      documentNo: shipment.code ?? null, sourceDocumentId: value.id, sourceDocumentNo: value.code, documentStatus: value.workflowStatus,
      movementType: 'purchase-return-outbound', supplierId: value.supplierId, supplierCode: value.supplierCodeSnapshot, supplierName: value.supplierNameSnapshot,
      warehouseId: value.warehouseId, warehouseName: shipment.warehouseNameSnapshot ?? null,
      warehouseState: shipment.warehouseNameSnapshot === undefined ? 'unavailable' : 'available', product: product(line), unit: unit(line),
      packageQuantity: -shipped.quantity, baseQuantityMilli: -shipped.baseQuantityMilli, pendingPackageQuantity: null, pendingBaseQuantityMilli: null,
      unitPriceCents: access.amountsVisible ? line.unitPriceCents : null, amountCents: access.amountsVisible ? -amount : null,
      amountState: access.amountsVisible ? 'available' : 'unavailable', documentCount: 1, sourcePath: `/procurement/purchase-returns/${value.id}` })
  }
  return rows
}

function hasLegacyMovementGap(state: ProcurementFeatureState): boolean {
  const recorded = new Map<string, number>()
  for (const inbound of state.purchaseInbounds ?? []) for (const line of inbound.lines) recorded.set(line.purchaseOrderLineId, (recorded.get(line.purchaseOrderLineId) ?? 0) + line.baseQuantityMilli)
  const missingInbound = (state.purchaseOrders ?? []).some((order) => order.lines.some((line) => line.receivedBaseQuantityMilli > (recorded.get(line.id) ?? 0)))
  const missingOutbound = (state.purchaseReturns ?? []).some((value) => value.shipments.some((shipment) => !shipment.code))
  return missingInbound || missingOutbound
}

function applyFilters(rows: PurchaseStatisticsRow[], query: PurchaseStatisticsPageQuery): PurchaseStatisticsRow[] {
  const keyword = query.keyword?.trim() ? normalize(query.keyword) : null
  return rows.filter((row) => datePart(row.occurredAt) >= query.fromDate && datePart(row.occurredAt) <= query.toDate)
    .filter((row) => !query.supplierId || row.supplierId === query.supplierId)
    .filter((row) => !keyword || [row.product.productCode, row.product.skuCode, row.product.name, row.product.specification, row.product.barcode ?? ''].some((value) => normalize(value).includes(keyword)))
}

function aggregate(rows: PurchaseStatisticsRow[], report: PurchaseStatisticsReportKey): PurchaseStatisticsRow[] {
  const groups = new Map<string, PurchaseStatisticsRow[]>()
  for (const row of rows) {
    const supplier = report === 'purchase-order-by-supplier' || report === 'purchase-movement-by-supplier' ? `${row.supplierId}:` : ''
    const key = `${supplier}${row.product.skuId}:${row.unit.procurementUnitId}:${row.unit.procurementUnitRateMilli}`
    const values = groups.get(key) ?? []; values.push(row); groups.set(key, values)
  }
  return [...groups.entries()].map(([key, values]) => {
    const first = values[0]!; const amountAvailable = values.every((item) => item.amountState === 'available' && item.amountCents !== null)
    const sourceIds = new Set(values.map((item) => item.sourceDocumentId).filter((id): id is string => Boolean(id)))
    return { ...first, id: `summary:${report}:${key}`, rowKind: 'summary' as const, occurredAt: values.map((item) => item.occurredAt).sort().at(-1)!,
      documentId: null, documentNo: null, sourceDocumentId: null, sourceDocumentNo: null, documentStatus: null, movementType: null,
      warehouseId: null, warehouseName: null, warehouseState: 'unavailable' as const,
      packageQuantity: values.reduce((sum, item) => sum + item.packageQuantity, 0), baseQuantityMilli: values.reduce((sum, item) => sum + item.baseQuantityMilli, 0),
      pendingPackageQuantity: values.some((item) => item.pendingPackageQuantity !== null) ? values.reduce((sum, item) => sum + (item.pendingPackageQuantity ?? 0), 0) : null,
      pendingBaseQuantityMilli: values.some((item) => item.pendingBaseQuantityMilli !== null) ? values.reduce((sum, item) => sum + (item.pendingBaseQuantityMilli ?? 0), 0) : null,
      unitPriceCents: amountAvailable && values.reduce((sum, item) => sum + item.baseQuantityMilli, 0) !== 0 ? Math.round(Math.abs(values.reduce((sum, item) => sum + (item.amountCents ?? 0), 0)) * 1000 / Math.abs(values.reduce((sum, item) => sum + item.baseQuantityMilli, 0))) : null,
      amountCents: amountAvailable ? values.reduce((sum, item) => sum + (item.amountCents ?? 0), 0) : null,
      amountState: amountAvailable ? 'available' as const : 'unavailable' as const, documentCount: sourceIds.size, sourcePath: null }
  })
}

function totals(rows: PurchaseStatisticsRow[], movement: boolean): PurchaseStatisticsTotals {
  const amountAvailable = rows.every((row) => row.amountState === 'available' && row.amountCents !== null)
  const orderRows = rows.filter((row) => row.movementType === 'purchase-inbound'); const returnRows = rows.filter((row) => row.movementType === 'purchase-return-outbound')
  const documents = new Set(rows.map((row) => row.sourceDocumentId).filter((id): id is string => Boolean(id)))
  const purchaseOrderAmountCents = amountAvailable ? orderRows.reduce((sum, row) => sum + (row.amountCents ?? 0), 0) : null
  const purchaseReturnAmountCents = amountAvailable ? Math.abs(returnRows.reduce((sum, row) => sum + (row.amountCents ?? 0), 0)) : null
  return { documentCount: documents.size, baseQuantityMilli: rows.reduce((sum, row) => sum + row.baseQuantityMilli, 0),
    amountCents: amountAvailable ? rows.reduce((sum, row) => sum + (row.amountCents ?? 0), 0) : null, amountState: amountAvailable ? 'available' : 'unavailable',
    purchaseOrderCount: movement ? new Set(orderRows.map((row) => row.sourceDocumentId)).size : 0,
    purchaseReturnCount: movement ? new Set(returnRows.map((row) => row.sourceDocumentId)).size : 0,
    purchaseOrderAmountCents: movement ? purchaseOrderAmountCents : null, purchaseReturnAmountCents: movement ? purchaseReturnAmountCents : null,
    netAmountCents: movement && purchaseOrderAmountCents !== null && purchaseReturnAmountCents !== null ? purchaseOrderAmountCents - purchaseReturnAmountCents : null }
}

function snapshotVersion(state: ProcurementFeatureState): string {
  const timestamps = [...(state.purchaseOrders ?? []).map((item) => item.updatedAt), ...(state.purchaseInbounds ?? []).map((item) => item.occurredAt), ...(state.purchaseReturns ?? []).map((item) => item.updatedAt)].sort()
  return `purstat-${state.purchaseOrders?.length ?? 0}-${state.purchaseInbounds?.length ?? 0}-${state.purchaseReturns?.length ?? 0}-${timestamps.at(-1) ?? 'empty'}`
}

export function createPurchaseStatisticsService(deps: PurchaseStatisticsServiceDependencies) {
  function build(actor: PurchaseStatisticsActor, input: PurchaseStatisticsQuery): { page: PurchaseStatisticsPage; all: PurchaseStatisticsRow[] } {
    const access = assertView(actor); const query = normalizePurchaseStatisticsQuery(input, deps.now()); const state = deps.repository.read(); const movement = !orderReports.has(query.report)
    const unavailable = deps.unavailableMessage ?? (movement && hasLegacyMovementGap(state) ? '历史采购移动缺少不可变入库/出库记录，不能用累计状态伪造统计。' : null)
    const emptyTotals = totals([], movement)
    if (unavailable) return { page: { report: query.report, availability: 'unavailable', message: unavailable, query, items: [], total: 0, totals: emptyTotals, snapshotVersion: snapshotVersion(state) }, all: [] }
    const filtered = applyFilters(movement ? movementRows(state, access) : orderRows(state, access), query)
    let rows = summaryReports.has(query.report) ? aggregate(filtered, query.report) : filtered
    rows.sort((a, b) => summaryReports.has(query.report) ? Math.abs(b.amountCents ?? 0) - Math.abs(a.amountCents ?? 0) || a.product.skuCode.localeCompare(b.product.skuCode) || a.id.localeCompare(b.id) : b.occurredAt.localeCompare(a.occurredAt) || (b.documentNo ?? '').localeCompare(a.documentNo ?? '') || b.id.localeCompare(a.id))
    const start = (query.page - 1) * query.pageSize
    return { page: { report: query.report, availability: 'available', message: null, query, items: structuredClone(rows.slice(start, start + query.pageSize)), total: rows.length, totals: totals(filtered, movement), snapshotVersion: snapshotVersion(state) }, all: rows }
  }
  function query(actor: PurchaseStatisticsActor, input: PurchaseStatisticsQuery): PurchaseStatisticsPage { return build(actor, input).page }
  function exportCsv(actor: PurchaseStatisticsActor, input: PurchaseStatisticsQuery): string {
    const access = assertView(actor); if (!access.canExport) throw new ProcurementDomainError('PROCUREMENT_PERMISSION_DENIED', '当前角色不可导出采购统计')
    const { page, all } = build(actor, input); if (page.availability === 'unavailable') throw new ProcurementDomainError('DATA_PROVIDER_UNAVAILABLE', page.message ?? '采购统计不可用')
    const headers = ['occurredAt', 'documentNo', 'sourceDocumentNo', 'documentStatus', 'movementType', 'supplierCode', 'supplierName', 'warehouseName', 'productCode', 'skuCode', 'productName', 'barcode', 'specification', 'category', 'baseUnit', 'procurementUnit', 'packageQuantity', 'baseQuantityMilli', 'pendingPackageQuantity', 'pendingBaseQuantityMilli', 'unitPriceCents', 'amountCents', 'documentCount']
    const lines = all.map((row) => [row.occurredAt, row.documentNo ?? '—', row.sourceDocumentNo ?? '—', row.documentStatus ?? '—', row.movementType ?? '—', row.supplierCode ?? '—', row.supplierName, row.warehouseName ?? 'unavailable', row.product.productCode, row.product.skuCode, row.product.name, row.product.barcodeState === 'available' ? row.product.barcode ?? '—' : 'unavailable', row.product.specification, row.product.categoryState === 'available' ? row.product.categoryName ?? '—' : 'unavailable', row.unit.baseUnitState === 'available' ? row.unit.baseUnitName ?? '—' : 'unavailable', row.unit.procurementUnitName, row.packageQuantity, row.baseQuantityMilli, row.pendingPackageQuantity ?? '—', row.pendingBaseQuantityMilli ?? '—', row.unitPriceCents ?? 'unavailable', row.amountCents ?? 'unavailable', row.documentCount].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(','))
    return `\uFEFF${[headers.join(','), ...lines].join('\r\n')}`
  }
  function listFilterOptions(actor: PurchaseStatisticsActor): PurchaseStatisticsFilterOptions {
    assertView(actor); const state = deps.repository.read(); const orders = (state.purchaseOrders ?? []).filter((item) => item.workflowStatus === 'pending-review' || item.workflowStatus === 'approved')
    const suppliers = [...new Map(orders.map((order) => { const master = state.suppliers.find((item) => item.id === order.supplierId); return [order.supplierId, { id: order.supplierId, code: master?.code ?? null, name: order.supplierNameSnapshot }] as const })).values()].sort((a, b) => (a.code ?? '').localeCompare(b.code ?? '') || a.name.localeCompare(b.name))
    const products = [...new Map(orders.flatMap((order) => order.lines.map((line) => [line.skuId, { skuId: line.skuId, skuCode: line.skuCodeSnapshot, name: line.productNameSnapshot, specification: line.specificationSnapshot }] as const))).values()].sort((a, b) => a.skuCode.localeCompare(b.skuCode))
    return { suppliers, products }
  }
  return { query, exportCsv, listFilterOptions, getAccess: (actor: PurchaseStatisticsActor) => getPurchaseStatisticsAccess(actor) }
}
