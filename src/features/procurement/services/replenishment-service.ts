import type {
  EntityId, InventoryReplenishmentProvider, ProcurementActor, ProcurementCatalogProvider, ProcurementSupplyProvider,
  ReplenishmentCandidateDraft, ReplenishmentDraftLine, ReplenishmentMode, ReplenishmentOrderProvider, ReplenishmentQuery,
  ReplenishmentResult, ReplenishmentRow, ReplenishmentSummary,
} from '../types'
import { assertManualReplenishmentQuantity, assertReplenishmentQuery } from '../schemas/replenishment-schema'

export class ReplenishmentDomainError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = 'ReplenishmentDomainError' }
}

interface ReplenishmentServiceDependencies {
  inventory: InventoryReplenishmentProvider
  catalog: ProcurementCatalogProvider
  supply: ProcurementSupplyProvider
  orders?: ReplenishmentOrderProvider
  now(): string
  nextId(kind: string): string
}

const canRead = (role: ProcurementActor['role']) => ['super-admin', 'warehouse', 'sales-supervisor'].includes(role)
const canWrite = (role: ProcurementActor['role']) => role === 'super-admin' || role === 'warehouse'
const ensureRead = (actor: ProcurementActor) => { if (!canRead(actor.role)) throw new ReplenishmentDomainError('PERMISSION_DENIED', '当前角色无权访问补货分析') }
const ensureWrite = (actor: ProcurementActor) => { if (!canWrite(actor.role)) throw new ReplenishmentDomainError('PERMISSION_DENIED', '当前角色无权操作快速采购') }
const ceilDiv = (value: number, divisor: number) => Math.ceil(value / divisor)
const roundQuantity = (value: number) => Math.round(value * 1000) / 1000

function procurementQuantity(baseMilli: number, rateMilli: number, minimum: number | null, multiple: number): number | null {
  if (!Number.isSafeInteger(baseMilli) || baseMilli < 0 || !Number.isSafeInteger(rateMilli) || rateMilli <= 0) return null
  const raw = ceilDiv(baseMilli, rateMilli)
  const min = minimum ?? 0
  const step = multiple > 0 ? multiple : 1
  if (!Number.isFinite(min) || min < 0 || !Number.isFinite(step)) return null
  return Math.max(min, Math.ceil(Math.max(raw, min) / step) * step)
}

function queryMatch(row: ReplenishmentRow, query: ReplenishmentQuery): boolean {
  if (query.categoryId && row.categoryId !== query.categoryId) return false
  if (query.warehouseId && row.warehouseId !== query.warehouseId) return false
  const keyword = query.keyword?.trim().toLocaleLowerCase()
  if (keyword && ![row.productName, row.productCode, row.skuCode, row.specification, row.warehouseName].some((item) => item.toLocaleLowerCase().includes(keyword))) return false
  return true
}

export function createReplenishmentService(deps: ReplenishmentServiceDependencies) {
  function unavailableRow(fact: ReturnType<InventoryReplenishmentProvider['snapshot']>['rows'][number], reason: string): ReplenishmentRow {
    return {
      id: `${fact.warehouseId}:${fact.skuId}`, warehouseId: fact.warehouseId, warehouseCode: fact.warehouseCode, warehouseName: fact.warehouseName,
      skuId: fact.skuId, categoryId: fact.categoryId, productName: fact.productName, productCode: fact.productCode, skuCode: fact.skuCode,
      specification: fact.specification, unitName: '', currentQuantity: fact.currentMilli / 1000, pendingQuantity: fact.pendingOutboundMilli === null ? null : fact.pendingOutboundMilli / 1000,
      shortageQuantity: fact.availableMilli === null ? null : Math.max(0, -fact.availableMilli / 1000), safetyMinimumQuantity: fact.safetyMinimumMilli / 1000,
      maximumQuantity: fact.maximumMilli === null ? null : fact.maximumMilli / 1000, suggestedQuantity: null, suggestionSource: [], supplyPriceCents: null,
      priceState: 'unavailable', estimatedAmountCents: null, availability: 'unavailable', unavailableReason: reason, calculatedQuantity: null, manualQuantity: null,
      quantitySource: 'calculated', supplierCandidates: [],
    }
  }

  function buildRow(fact: ReturnType<InventoryReplenishmentProvider['snapshot']>['rows'][number], mode: ReplenishmentMode): ReplenishmentRow {
    const sku = deps.catalog.getSku(fact.skuId)
    if (!sku) return unavailableRow(fact, '商品资料不可用')
    const candidateSuppliers = deps.supply.listCandidates(fact.skuId, 'warehouse')
    const preferred = candidateSuppliers.find((item) => item.preferred)
    const priceState = preferred ? 'available' : candidateSuppliers.length > 1 ? 'manual-required' : 'unavailable'
    const base = { ...unavailableRow(fact, ''), unitName: preferred?.procurementUnitName ?? sku.procurementUnitName, supplierCandidates: candidateSuppliers, priceState: priceState as ReplenishmentRow['priceState'], supplyPriceCents: preferred?.supplyPriceCents ?? null }
    const inTransit = fact.inTransitMilli
    const available = fact.availableMilli
    const safetyEligible = fact.maximumMilli !== null && fact.currentMilli <= fact.safetyMinimumMilli
    const shortageEligible = available !== null && available < 0
    const safetyBase = safetyEligible && inTransit !== null ? Math.max(0, fact.maximumMilli! - fact.currentMilli - inTransit) : null
    const shortageBase = shortageEligible && inTransit !== null ? Math.max(0, -available - inTransit) : null
    const sources: Array<'safety' | 'shortage'> = []
    if (safetyBase !== null) sources.push('safety')
    if (shortageBase !== null) sources.push('shortage')
    const selectedBase = mode === 'safety' ? safetyBase : mode === 'shortage' ? shortageBase : (safetyBase === null && shortageBase === null ? null : Math.max(safetyBase ?? 0, shortageBase ?? 0))
    const selectedSources = mode === 'safety' ? (safetyBase === null ? [] : ['safety'] as const) : mode === 'shortage' ? (shortageBase === null ? [] : ['shortage'] as const) : sources.filter((source) => (source === 'safety' ? safetyBase : shortageBase) === selectedBase)
    const calculated = selectedBase === null ? null : procurementQuantity(selectedBase, preferred?.procurementUnitRateMilli ?? sku.procurementUnitRateMilli, sku.minimumOrderQuantity, sku.orderMultiple)
    const unavailableReason: string | undefined = selectedBase === null ? (mode === 'combined' ? (sources.length === 0 ? '安全库存或缺货分析不可用' : undefined) : mode === 'safety' ? (fact.maximumMilli === null || inTransit === null ? '安全库存上限或在途 provider 不可用' : '当前库存未达到安全库存触发条件') : (available === null || inTransit === null ? '可用库存或在途 provider 不可用' : '当前没有缺货')) : undefined
    const availability = calculated === null || !preferred ? 'unavailable' : 'available'
    return {
      ...base,
      currentQuantity: fact.currentMilli / 1000,
      pendingQuantity: fact.pendingOutboundMilli === null ? null : fact.pendingOutboundMilli / 1000,
      shortageQuantity: available === null ? null : Math.max(0, -available / 1000),
      safetyMinimumQuantity: fact.safetyMinimumMilli / 1000,
      maximumQuantity: fact.maximumMilli === null ? null : fact.maximumMilli / 1000,
      suggestedQuantity: calculated,
      suggestionSource: [...selectedSources],
      estimatedAmountCents: calculated !== null && preferred ? Math.round(calculated * preferred.supplyPriceCents) : null,
      availability,
      unavailableReason: availability === 'unavailable' ? (priceState !== 'available' ? (priceState === 'manual-required' ? '存在多个有效供应商，需人工选择' : '无有效首选供应关系') : unavailableReason ?? undefined) : undefined,
      calculatedQuantity: calculated,
      manualQuantity: null,
      quantitySource: 'calculated',
    }
  }

  function analyze(actor: ProcurementActor, query: ReplenishmentQuery): ReplenishmentResult {
    ensureRead(actor)
    assertReplenishmentQuery(query)
    const snapshot = deps.inventory.snapshot()
    if (!snapshot.available) return { rows: [], summary: { inventoryTotal: null, shortageTotal: null, suggestedTotal: null }, availability: 'unavailable', version: snapshot.version }
    const rows = snapshot.rows.map((fact) => buildRow(fact, query.mode)).filter((row) => queryMatch(row, query)).sort((a, b) => a.warehouseCode.localeCompare(b.warehouseCode) || a.skuCode.localeCompare(b.skuCode))
    const sum = (field: 'currentQuantity' | 'shortageQuantity' | 'suggestedQuantity') => rows.every((row) => row[field] !== null) ? roundQuantity(rows.reduce((total, row) => total + (row[field] ?? 0), 0)) : null
    return { rows, summary: { inventoryTotal: sum('currentQuantity'), shortageTotal: sum('shortageQuantity'), suggestedTotal: sum('suggestedQuantity') }, availability: rows.some((row) => row.availability === 'unavailable') ? 'unavailable' : 'available', version: snapshot.version }
  }

  function applyManualQuantity(actor: ProcurementActor, row: ReplenishmentRow, quantity: number): ReplenishmentRow {
    ensureWrite(actor)
    assertManualReplenishmentQuantity(quantity)
    const sku = deps.catalog.getSku(row.skuId); if (!sku) throw new ReplenishmentDomainError('SKU_UNAVAILABLE', '商品资料不可用')
    const multiple = sku.orderMultiple > 0 ? sku.orderMultiple : 1; const minimum = sku.minimumOrderQuantity ?? 0
    if (quantity < minimum || quantity % multiple !== 0) throw new ReplenishmentDomainError('QUANTITY_CONSTRAINT', '手工数量不满足最小起订量或采购倍数')
    const price = row.supplyPriceCents
    return { ...row, manualQuantity: quantity, suggestedQuantity: quantity, quantitySource: 'manual', estimatedAmountCents: price === null ? null : Math.round(quantity * price), availability: price === null ? 'unavailable' : 'available' }
  }

  function createStockDraft(actor: ProcurementActor, rows: ReplenishmentRow[], selected: Array<{ row: ReplenishmentRow; supplierId?: EntityId }>): ReplenishmentCandidateDraft {
    ensureWrite(actor)
    if (!selected.length) throw new ReplenishmentDomainError('EMPTY_SELECTION', '至少选择一条补货候选')
    const lines: ReplenishmentDraftLine[] = selected.map(({ row, supplierId }) => {
      const quantity = row.manualQuantity ?? row.calculatedQuantity
      if (!quantity || row.availability === 'unavailable') throw new ReplenishmentDomainError('UNAVAILABLE_CANDIDATE', '候选存在不可用事实或数量')
      return { rowId: row.id, warehouseId: row.warehouseId, skuId: row.skuId, supplierId, quantity, source: 'stock-analysis' }
    })
    return { id: deps.nextId('replenishment-draft'), source: 'stock', createdAt: deps.now(), lines, orderSnapshots: [] }
  }

  function listOrderCandidates(actor: ProcurementActor, includeUndelivered = false) {
    ensureWrite(actor)
    if (!deps.orders) return { availability: 'unavailable' as const, rows: [], version: 'orders:unavailable' }
    const snapshot = deps.orders.snapshot(); if (!snapshot.available) return { availability: 'unavailable' as const, rows: [], version: snapshot.version }
    return { availability: 'available' as const, rows: includeUndelivered ? snapshot.rows : snapshot.rows.filter((row) => row.deliveryAt !== null), version: snapshot.version }
  }

  function createOrderDraft(actor: ProcurementActor, rows: ReturnType<typeof listOrderCandidates>['rows']): ReplenishmentCandidateDraft {
    ensureWrite(actor); if (!rows.length) throw new ReplenishmentDomainError('EMPTY_SELECTION', '没有可交接的订单候选')
    return { id: deps.nextId('replenishment-order-draft'), source: 'order', createdAt: deps.now(), lines: rows.map((row) => ({ rowId: row.orderId, warehouseId: row.warehouseId, skuId: row.skuId, supplierId: row.supplierId ?? undefined, quantity: Math.max(0, row.quantityMilli / 1000), source: 'order-analysis', sourceOrderId: row.orderId })), orderSnapshots: rows.map((row) => ({ orderId: row.orderId, orderCode: row.orderCode, status: row.status })) }
  }

  function exportCsv(result: ReplenishmentResult): string {
    const cell = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`
    const header = ['warehouseCode', 'warehouseName', 'skuCode', 'productName', 'unit', 'currentQuantity', 'pendingQuantity', 'shortageQuantity', 'safetyMinimum', 'maximum', 'suggestedQuantity', 'quantitySource', 'priceCents', 'estimatedAmountCents', 'availability']
    const body = result.rows.map((row) => [row.warehouseCode, row.warehouseName, row.skuCode, row.productName, row.unitName, row.currentQuantity ?? 'unavailable', row.pendingQuantity ?? 'unavailable', row.shortageQuantity ?? 'unavailable', row.safetyMinimumQuantity ?? 'unavailable', row.maximumQuantity ?? 'unavailable', row.suggestedQuantity ?? 'unavailable', row.quantitySource, row.supplyPriceCents ?? 'unavailable', row.estimatedAmountCents ?? 'unavailable', row.availability].map(cell).join(','))
    return `\uFEFF${[header.join(','), ...body].join('\r\n')}`
  }

  return { analyze, applyManualQuantity, createStockDraft, listOrderCandidates, createOrderDraft, exportCsv }
}
