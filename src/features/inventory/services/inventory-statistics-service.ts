import type { InventoryRepository } from '../repositories/inventory-repository'
import type {
  InventoryActor, InventoryCatalogProvider, InventoryClosing, InventoryFeatureState, InventoryMovement,
  InventoryStatisticsFilterOptions, InventoryStatisticsPage, InventoryStatisticsQuery, InventoryStatisticsReportKey,
  InventoryStatisticsRow, InventoryStatisticsSkuRow, InventoryStatisticsTotals, InventoryStatisticsWarehouseRow,
} from '../types'

export class InventoryStatisticsError extends Error {
  constructor(readonly code: 'PERMISSION_DENIED' | 'INVALID_QUERY', message: string) { super(message); this.name = 'InventoryStatisticsError' }
}

export interface InventoryStatisticsServiceDependencies { repository: InventoryRepository; catalog: InventoryCatalogProvider; now: () => string }

const reports = new Set<InventoryStatisticsReportKey>(['inventory-ledger', 'warehouse-ledger', 'movement-summary', 'warehouse-receipts-issues'])
const pageSizes = new Set([10, 30, 50, 100])
const skuReports = new Set<InventoryStatisticsReportKey>(['inventory-ledger', 'movement-summary'])
const datePattern = /^\d{4}-\d{2}-\d{2}$/
const datePart = (value: string) => value.slice(0, 10)
const monthPart = (value: string) => value.slice(0, 7)
const movementAmount = (movement: InventoryMovement) => Math.round(movement.quantityMilli * movement.costPerBaseUnitCents / 1000)
const signedQuantity = (movement: InventoryMovement) => movement.direction === 'inbound' ? movement.quantityMilli : -movement.quantityMilli
const signedAmount = (movement: InventoryMovement) => movement.direction === 'inbound' ? movementAmount(movement) : -movementAmount(movement)
const lastDateOfMonth = (month: string) => { const date = new Date(`${month}-01T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() + 1); date.setUTCDate(0); return date.toISOString().slice(0, 10) }

function assertView(actor: InventoryActor): void {
  if (!['super-admin', 'warehouse', 'sales-supervisor'].includes(actor.role)) throw new InventoryStatisticsError('PERMISSION_DENIED', '当前角色无权查看库存统计')
}

function normalizeQuery(input: InventoryStatisticsQuery, now: string): InventoryStatisticsPage['query'] {
  const today = datePart(now); const report = reports.has(input.report as InventoryStatisticsReportKey) ? input.report as InventoryStatisticsReportKey : 'inventory-ledger'
  const fromDate = input.fromDate ?? `${monthPart(now)}-01`; const toDate = input.toDate ?? today
  if (!datePattern.test(fromDate) || !datePattern.test(toDate) || Number.isNaN(Date.parse(`${fromDate}T00:00:00Z`)) || Number.isNaN(Date.parse(`${toDate}T00:00:00Z`))) throw new InventoryStatisticsError('INVALID_QUERY', '统计日期格式无效')
  if (fromDate > toDate) throw new InventoryStatisticsError('INVALID_QUERY', '开始日期不能晚于结束日期')
  const page = Number.isSafeInteger(input.page) && (input.page ?? 0) > 0 ? input.page! : 1
  const pageSize = pageSizes.has(input.pageSize ?? 30) ? input.pageSize ?? 30 : 30
  return { report, fromDate, toDate, warehouseId: input.warehouseId, categoryId: input.categoryId, page, pageSize }
}

type MutableValues = {
  openingQuantityMilli: number; openingAmountCents: number; inboundQuantityMilli: number; inboundAmountCents: number
  outboundQuantityMilli: number; outboundAmountCents: number; endingQuantityMilli: number; endingAmountCents: number
  costAdjustmentCents: number; inboundDocuments: Set<string>; outboundDocuments: Set<string>
}
const emptyValues = (): MutableValues => ({ openingQuantityMilli: 0, openingAmountCents: 0, inboundQuantityMilli: 0, inboundAmountCents: 0, outboundQuantityMilli: 0, outboundAmountCents: 0, endingQuantityMilli: 0, endingAmountCents: 0, costAdjustmentCents: 0, inboundDocuments: new Set(), outboundDocuments: new Set() })

function addMovement(values: MutableValues, movement: InventoryMovement, fromDate: string, toDate: string): void {
  const day = datePart(movement.occurredAt); const quantity = signedQuantity(movement); const value = signedAmount(movement)
  if (day < fromDate) { values.openingQuantityMilli += quantity; values.openingAmountCents += value }
  if (day <= toDate) { values.endingQuantityMilli += quantity; values.endingAmountCents += value }
  if (day >= fromDate && day <= toDate) {
    const documentKey = `${movement.direction}|${movement.warehouseId}|${movement.requestId}`
    if (movement.direction === 'inbound') { values.inboundQuantityMilli += movement.quantityMilli; values.inboundAmountCents += movementAmount(movement); values.inboundDocuments.add(documentKey) }
    else { values.outboundQuantityMilli += movement.quantityMilli; values.outboundAmountCents += movementAmount(movement); values.outboundDocuments.add(documentKey) }
  }
}

function addCostHistory(values: MutableValues, value: { effectiveAt: string; valueDeltaCents: number }, fromDate: string, toDate: string): void {
  const day = datePart(value.effectiveAt)
  if (day < fromDate) values.openingAmountCents += value.valueDeltaCents
  if (day <= toDate) values.endingAmountCents += value.valueDeltaCents
  if (day >= fromDate && day <= toDate) values.costAdjustmentCents += value.valueDeltaCents
}

function validateClosings(state: InventoryFeatureState, toDate: string): string | null {
  const closings = (state.closings ?? []).filter((item) => lastDateOfMonth(item.month) <= toDate)
  for (const closing of closings) {
    const end = lastDateOfMonth(closing.month); const ledger = new Map<string, { quantityMilli: number; valueCents: number }>()
    for (const movement of state.movements.filter((item) => datePart(item.occurredAt) <= end)) {
      const key = `${movement.warehouseId}|${movement.skuId}`; const current = ledger.get(key) ?? { quantityMilli: 0, valueCents: 0 }
      current.quantityMilli += signedQuantity(movement); current.valueCents += signedAmount(movement); ledger.set(key, current)
    }
    for (const history of (state.costHistories ?? []).filter((item) => datePart(item.effectiveAt) <= end)) {
      const key = `${history.warehouseId}|${history.skuId}`; const current = ledger.get(key) ?? { quantityMilli: 0, valueCents: 0 }
      current.valueCents += history.valueDeltaCents; ledger.set(key, current)
    }
    const snapshots = new Map(closing.snapshots.map((item) => [`${item.warehouseId}|${item.skuId}`, item]))
    const keys = new Set([...ledger.keys(), ...snapshots.keys()])
    for (const key of keys) {
      const actual = ledger.get(key) ?? { quantityMilli: 0, valueCents: 0 }; const expected = snapshots.get(key)
      if (actual.quantityMilli !== (expected?.quantityMilli ?? 0) || actual.valueCents !== (expected?.valueCents ?? 0)) return `库存结转 ${closing.month} 与不可变账本不一致，统计已停止。`
    }
  }
  return null
}

function closingState(closings: InventoryClosing[], toDate: string, today: string): InventoryStatisticsPage['periodState'] {
  if (toDate >= today) return 'current'
  return closings.some((item) => item.month === monthPart(toDate) && lastDateOfMonth(item.month) === toDate) ? 'closed' : 'unclosed'
}

export function createInventoryStatisticsService(deps: InventoryStatisticsServiceDependencies) {
  function build(actor: InventoryActor, input: InventoryStatisticsQuery = {}): InventoryStatisticsPage {
    assertView(actor); const query = normalizeQuery(input, deps.now()); const state = deps.repository.read(); const amountsVisible = actor.role !== 'sales-supervisor'
    let catalogState: 'available' | 'partial' = 'available'; let skus: ReturnType<InventoryCatalogProvider['listSkus']> = []
    try { skus = deps.catalog.listSkus() } catch { catalogState = 'partial' }
    const skuMap = new Map(skus.map((item) => [item.skuId, item])); const warehouseMap = new Map(state.warehouses.map((item) => [item.id, item]))
    const closingMessage = validateClosings(state, query.toDate); const periodState = closingState(state.closings ?? [], query.toDate, datePart(deps.now()))
    const movements = state.movements.filter((item) => !skuMap.get(item.skuId)?.deleted).filter((item) => !query.warehouseId || item.warehouseId === query.warehouseId).filter((item) => {
      if (!query.categoryId) return true; return skuMap.get(item.skuId)?.categoryId === query.categoryId
    })
    const histories = (state.costHistories ?? []).filter((item) => !skuMap.get(item.skuId)?.deleted).filter((item) => !query.warehouseId || item.warehouseId === query.warehouseId).filter((item) => {
      if (!query.categoryId) return true; return skuMap.get(item.skuId)?.categoryId === query.categoryId
    })
    const bySku = new Map<string, MutableValues>(); const byWarehouse = new Map<string, MutableValues>()
    for (const movement of movements) {
      const skuValues = bySku.get(movement.skuId) ?? emptyValues(); addMovement(skuValues, movement, query.fromDate, query.toDate); bySku.set(movement.skuId, skuValues)
      const warehouseValues = byWarehouse.get(movement.warehouseId) ?? emptyValues(); addMovement(warehouseValues, movement, query.fromDate, query.toDate); byWarehouse.set(movement.warehouseId, warehouseValues)
    }
    for (const history of histories) {
      const skuValues = bySku.get(history.skuId) ?? emptyValues(); addCostHistory(skuValues, history, query.fromDate, query.toDate); bySku.set(history.skuId, skuValues)
      const warehouseValues = byWarehouse.get(history.warehouseId) ?? emptyValues(); addCostHistory(warehouseValues, history, query.fromDate, query.toDate); byWarehouse.set(history.warehouseId, warehouseValues)
    }
    const hasValue = (value: MutableValues) => [value.openingQuantityMilli, value.openingAmountCents, value.inboundQuantityMilli, value.inboundAmountCents, value.outboundQuantityMilli, value.outboundAmountCents, value.endingQuantityMilli, value.endingAmountCents, value.costAdjustmentCents].some(Boolean)
    const mask = (value: number) => amountsVisible ? value : null
    const skuRows: InventoryStatisticsSkuRow[] = [...bySku].filter(([, value]) => hasValue(value)).map(([skuId, value]): InventoryStatisticsSkuRow => ({ kind: 'sku', id: skuId, skuId, sku: skuMap.get(skuId) ?? null, openingQuantityMilli: value.openingQuantityMilli, openingAmountCents: mask(value.openingAmountCents), inboundQuantityMilli: value.inboundQuantityMilli, inboundAmountCents: mask(value.inboundAmountCents), outboundQuantityMilli: value.outboundQuantityMilli, outboundAmountCents: mask(value.outboundAmountCents), endingQuantityMilli: value.endingQuantityMilli, endingAmountCents: mask(value.endingAmountCents), costAdjustmentCents: mask(value.costAdjustmentCents) })).sort((a, b) => (a.sku?.skuCode ?? a.skuId).localeCompare(b.sku?.skuCode ?? b.skuId))
    const warehouseRows: InventoryStatisticsWarehouseRow[] = [...byWarehouse].filter(([, value]) => hasValue(value)).map(([warehouseId, value]): InventoryStatisticsWarehouseRow => ({ kind: 'warehouse', id: warehouseId, warehouse: warehouseMap.get(warehouseId)!, openingQuantityMilli: value.openingQuantityMilli, openingAmountCents: mask(value.openingAmountCents), inboundQuantityMilli: value.inboundQuantityMilli, inboundAmountCents: mask(value.inboundAmountCents), inboundDocumentCount: value.inboundDocuments.size, outboundQuantityMilli: value.outboundQuantityMilli, outboundAmountCents: mask(value.outboundAmountCents), outboundDocumentCount: value.outboundDocuments.size, endingQuantityMilli: value.endingQuantityMilli, endingAmountCents: mask(value.endingAmountCents), costAdjustmentCents: mask(value.costAdjustmentCents) })).filter((item) => item.warehouse).sort((a, b) => a.warehouse.code.localeCompare(b.warehouse.code))
    const allValues = emptyValues(); for (const movement of movements) addMovement(allValues, movement, query.fromDate, query.toDate); for (const history of histories) addCostHistory(allValues, history, query.fromDate, query.toDate)
    const totals: InventoryStatisticsTotals = { openingQuantityMilli: allValues.openingQuantityMilli, openingAmountCents: mask(allValues.openingAmountCents), inboundQuantityMilli: allValues.inboundQuantityMilli, inboundAmountCents: mask(allValues.inboundAmountCents), inboundDocumentCount: allValues.inboundDocuments.size, outboundQuantityMilli: allValues.outboundQuantityMilli, outboundAmountCents: mask(allValues.outboundAmountCents), outboundDocumentCount: allValues.outboundDocuments.size, endingQuantityMilli: allValues.endingQuantityMilli, endingAmountCents: mask(allValues.endingAmountCents), netQuantityMilli: allValues.inboundQuantityMilli - allValues.outboundQuantityMilli, netAmountCents: mask(allValues.inboundAmountCents - allValues.outboundAmountCents), costAdjustmentCents: mask(allValues.costAdjustmentCents) }
    const allRows: InventoryStatisticsRow[] = skuReports.has(query.report) ? skuRows : warehouseRows; const start = (query.page - 1) * query.pageSize
    const message = closingMessage ?? (catalogState === 'partial' ? '商品资料部分不可用；保留 SKU 标识，分类筛选可能没有结果。' : periodState === 'unclosed' ? '所选历史期间尚未结转，补录库存事实后结果可能变化。' : null)
    return { report: query.report, query, items: closingMessage ? [] : allRows.slice(start, start + query.pageSize), total: closingMessage ? 0 : allRows.length, totals, snapshotVersion: `inventory-statistics:${state.movements.map((item) => item.id).join('|')}:${(state.costHistories ?? []).map((item) => item.id).join('|')}`, availability: closingMessage ? 'unavailable' : 'available', catalogState, periodState, message, amountsVisible }
  }

  function listFilterOptions(actor: InventoryActor): InventoryStatisticsFilterOptions {
    assertView(actor); const state = deps.repository.read(); let catalogState: 'available' | 'partial' = 'available'; let categories: Array<{ id: string; name: string }> = []
    try { categories = deps.catalog.listCategories?.() ?? [...new Set(deps.catalog.listSkus().map((item) => item.categoryId))].map((id) => ({ id, name: id })) } catch { catalogState = 'partial' }
    return { warehouses: state.warehouses.map((item) => ({ id: item.id, code: item.code, name: item.name, status: item.status })).sort((a, b) => a.code.localeCompare(b.code)), categories: categories.sort((a, b) => a.name.localeCompare(b.name)), catalogState }
  }
  return { query: build, listFilterOptions }
}
