import { assertLocationDraft, assertWarehouseDraft, InventoryValidationError } from '../schemas/inventory-schema'
import type { InventoryRepository } from '../repositories/inventory-repository'
import type {
  BatchStatus, ConfirmInboundInput, ConfirmOutboundInput, EntityId, FifoAllocation, InventoryActor, InventoryBatchRow,
  InventoryCatalogProvider, InventoryFeatureState, InventoryLocation, InventoryMovementRow, InventoryQuery, InventoryStatus,
  InventoryStockRow, InventoryThreshold, InventoryWorkspace, LocationDraft, LocationImportPreview, LocationImportRow,
  PageResult, Warehouse, WarehouseDraft,
} from '../types'

export type InventoryDomainErrorCode = 'PERMISSION_DENIED' | 'NOT_FOUND' | 'DUPLICATE' | 'INVALID_STATE' | 'SOURCE_NOT_FOUND' | 'INSUFFICIENT_STOCK' | 'EXPIRED_BATCH' | 'PRODUCT_UNAVAILABLE'
export class InventoryDomainError extends Error {
  constructor(readonly code: InventoryDomainErrorCode, message: string) { super(message); this.name = 'InventoryDomainError' }
}

export interface InventoryServiceDependencies {
  repository: InventoryRepository; catalog: InventoryCatalogProvider; now: () => string
  nextId: (kind: 'warehouse' | 'location' | 'batch' | 'balance' | 'movement' | 'log') => string
}

const readRoles = new Set(['super-admin', 'warehouse', 'sales-supervisor'])
const writeRoles = new Set(['super-admin', 'warehouse'])
const normalize = (value: string) => value.trim().toLocaleLowerCase()
const datePart = (value: string) => value.slice(0, 10)
const monthPart = (value: string) => value.slice(0, 7)

function assertRead(actor: InventoryActor): void { if (!readRoles.has(actor.role)) throw new InventoryDomainError('PERMISSION_DENIED', '当前角色不可访问库存模块') }
function assertWrite(actor: InventoryActor): void { if (!writeRoles.has(actor.role)) throw new InventoryDomainError('PERMISSION_DENIED', '当前角色不可修改库存资料') }
function positiveMilli(value: number): void { if (!Number.isSafeInteger(value) || value <= 0) throw new InventoryValidationError([{ path: 'quantityMilli', message: '必须是正整数毫单位' }]) }
function cloneWarehouseFor(actor: InventoryActor, warehouse: Warehouse): Warehouse { return actor.role === 'sales-supervisor' ? { ...structuredClone(warehouse), contactName: null, phone: null } : structuredClone(warehouse) }
function amount(quantityMilli: number, costCents: number): number { return Math.round(quantityMilli * costCents / 1000) }

export function calculateInventoryStatus(availableMilli: number | null, threshold: InventoryThreshold | null): InventoryStatus {
  if (availableMilli === null) return 'unavailable'
  if (availableMilli === 0) return 'zero'
  const minimum = threshold?.safetyMinimumMilli ?? 0
  if (availableMilli <= minimum) return 'insufficient'
  if (threshold?.maximumMilli !== null && threshold?.maximumMilli !== undefined && availableMilli > threshold.maximumMilli) return 'overstock'
  return 'normal'
}

export function calculateBatchStatus(batch: { expiresOn: string | null }, clock: string): BatchStatus {
  if (!batch.expiresOn) return 'normal'
  const today = Date.parse(`${datePart(clock)}T00:00:00Z`); const expiry = Date.parse(`${batch.expiresOn}T00:00:00Z`)
  if (today > expiry) return 'expired'
  return Math.round((expiry - today) / 86_400_000) <= 30 ? 'near-expiry' : 'normal'
}

function addDays(date: string, days: number): string { const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10) }
function warehouseById(state: InventoryFeatureState, id: string): Warehouse { const value = state.warehouses.find((item) => item.id === id); if (!value) throw new InventoryDomainError('NOT_FOUND', '仓库不存在'); return value }
function locationById(state: InventoryFeatureState, id: string): InventoryLocation { const value = state.locations.find((item) => item.id === id); if (!value) throw new InventoryDomainError('NOT_FOUND', '库位不存在'); return value }

export function createInventoryService(deps: InventoryServiceDependencies) {
  function catalogRows(): { items: ReturnType<InventoryCatalogProvider['listSkus']>; available: boolean } {
    try { return { items: deps.catalog.listSkus(), available: true } } catch { return { items: [], available: false } }
  }

  function listStocks(actor: InventoryActor, query: InventoryQuery = {}): PageResult<InventoryStockRow> {
    assertRead(actor); const state = deps.repository.read(); const catalog = catalogRows(); const skuMap = new Map(catalog.items.map((item) => [item.skuId, item]))
    const keys = new Set<string>()
    state.balances.forEach((item) => keys.add(`${item.warehouseId}|${item.skuId}`)); state.thresholds.forEach((item) => keys.add(`${item.warehouseId}|${item.skuId}`)); state.openingBalances.filter((item) => item.month === monthPart(deps.now())).forEach((item) => keys.add(`${item.warehouseId}|${item.skuId}`))
    const keyword = normalize(query.keyword ?? '')
    let rows = [...keys].map((key): InventoryStockRow => {
      const [warehouseId, skuId] = key.split('|'); const warehouse = warehouseById(state, warehouseId); const sku = skuMap.get(skuId) ?? null
      const currentMilli = state.balances.filter((item) => item.warehouseId === warehouseId && item.skuId === skuId).reduce((sum, item) => sum + item.quantityMilli, 0)
      const openingMilli = state.openingBalances.find((item) => item.month === monthPart(deps.now()) && item.warehouseId === warehouseId && item.skuId === skuId)?.quantityMilli ?? 0
      const threshold = state.thresholds.find((item) => item.warehouseId === warehouseId && item.skuId === skuId) ?? { warehouseId, skuId, safetyMinimumMilli: 0, maximumMilli: null }
      const costs = state.balances.filter((item) => item.warehouseId === warehouseId && item.skuId === skuId && item.quantityMilli > 0).map((balance) => ({ quantity: balance.quantityMilli, cost: state.batches.find((batch) => batch.id === balance.batchId)?.costPerBaseUnitCents ?? 0 }))
      const costPerBaseUnitCents = costs.length ? Math.round(costs.reduce((sum, item) => sum + item.quantity * item.cost, 0) / costs.reduce((sum, item) => sum + item.quantity, 0)) : null
      return { warehouse: cloneWarehouseFor(actor, warehouse), sku, skuId, openingMilli, currentMilli, pendingOutboundMilli: null, availableMilli: null, inTransitMilli: null, safetyMinimumMilli: threshold.safetyMinimumMilli, maximumMilli: threshold.maximumMilli, status: calculateInventoryStatus(null, threshold), costPerBaseUnitCents: actor.role === 'sales-supervisor' ? null : costPerBaseUnitCents, amountCents: actor.role === 'sales-supervisor' || costPerBaseUnitCents === null ? null : amount(currentMilli, costPerBaseUnitCents) }
    }).filter((row) => !query.warehouseId || row.warehouse.id === query.warehouseId)
      .filter((row) => !query.categoryId || row.sku?.categoryId === query.categoryId)
      .filter((row) => !query.status || row.status === query.status)
      .filter((row) => !keyword || [row.warehouse.code, row.warehouse.name, row.skuId, row.sku?.skuCode, row.sku?.productName, row.sku?.barcode].some((value) => value && normalize(value).includes(keyword)))
    rows = rows.sort((a, b) => a.warehouse.code.localeCompare(b.warehouse.code) || (a.sku?.skuCode ?? a.skuId).localeCompare(b.sku?.skuCode ?? b.skuId))
    const page = Math.max(1, query.page ?? 1); const pageSize = 30; return { items: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, pageSize }
  }

  function listBatches(actor: InventoryActor): InventoryBatchRow[] {
    assertRead(actor); const state = deps.repository.read(); return state.balances.filter((item) => item.quantityMilli > 0).map((balance) => {
      const batch = state.batches.find((item) => item.id === balance.batchId)!; const warehouse = warehouseById(state, balance.warehouseId); const location = locationById(state, balance.locationId)
      let sku = null; try { sku = deps.catalog.getSku(balance.skuId) } catch { sku = null }
      return { warehouse: cloneWarehouseFor(actor, warehouse), location, batch, sku, quantityMilli: balance.quantityMilli, amountCents: actor.role === 'sales-supervisor' ? 0 : amount(balance.quantityMilli, batch.costPerBaseUnitCents), status: calculateBatchStatus(batch, deps.now()) }
    }).sort((a, b) => b.batch.receivedAt.localeCompare(a.batch.receivedAt) || a.batch.id.localeCompare(b.batch.id))
  }

  function listMovements(actor: InventoryActor, batchOnly = false): InventoryMovementRow[] {
    assertRead(actor); const state = deps.repository.read(); return state.movements.map((movement) => {
      const batch = state.batches.find((item) => item.id === movement.batchId)!; let sku = null; try { sku = deps.catalog.getSku(movement.skuId) } catch { sku = null }
      const cost = actor.role === 'sales-supervisor' ? 0 : movement.costPerBaseUnitCents
      return { ...movement, costPerBaseUnitCents: cost, warehouseName: warehouseById(state, movement.warehouseId).name, locationName: locationById(state, movement.locationId).name, batchNumber: batch.batchNumber, productionDate: batch.productionDate, expiresOn: batch.expiresOn, sku, amountCents: amount(movement.quantityMilli, cost) }
    }).filter((item) => !batchOnly || state.batches.find((batch) => batch.id === item.batchId)?.tracked).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.id.localeCompare(a.id))
  }

  function getWorkspace(actor: InventoryActor, query: InventoryQuery = {}): InventoryWorkspace {
    const state = deps.repository.read(); const catalog = catalogRows(); return { stocks: listStocks(actor, query), batches: listBatches(actor), movements: listMovements(actor), warehouses: state.warehouses.map((item) => cloneWarehouseFor(actor, item)).sort((a, b) => a.type.localeCompare(b.type) || a.code.localeCompare(b.code)), locations: structuredClone(state.locations), catalogAvailable: catalog.available }
  }

  function saveThreshold(actor: InventoryActor, threshold: InventoryThreshold): InventoryThreshold {
    assertWrite(actor); if (!Number.isSafeInteger(threshold.safetyMinimumMilli) || threshold.safetyMinimumMilli < 0 || (threshold.maximumMilli !== null && (!Number.isSafeInteger(threshold.maximumMilli) || threshold.maximumMilli <= threshold.safetyMinimumMilli))) throw new InventoryValidationError([{ path: 'threshold', message: '下限必须非负，上限必须为空或大于下限' }])
    return deps.repository.transact((state) => { warehouseById(state, threshold.warehouseId); if (!deps.catalog.getSku(threshold.skuId)) throw new InventoryDomainError('PRODUCT_UNAVAILABLE', 'SKU 不存在'); const index = state.thresholds.findIndex((item) => item.warehouseId === threshold.warehouseId && item.skuId === threshold.skuId); if (index >= 0) state.thresholds[index] = structuredClone(threshold); else state.thresholds.push(structuredClone(threshold)); state.changeLogs.push({ id: deps.nextId('log'), enterpriseId: state.enterpriseId, action: 'threshold.saved', targetId: `${threshold.warehouseId}:${threshold.skuId}`, operatorId: actor.actorId, detail: '保存库存阈值', createdAt: deps.now() }); return threshold })
  }

  function saveWarehouse(actor: InventoryActor, draft: WarehouseDraft, id?: string): Warehouse {
    assertWrite(actor); assertWarehouseDraft(draft); const clean = { ...draft, code: draft.code.trim(), name: draft.name.trim(), contactName: draft.contactName?.trim() || null, phone: draft.phone?.trim() || null, address: draft.address?.trim() || null }
    return deps.repository.transact((state) => {
      const duplicate = state.warehouses.find((item) => item.id !== id && (normalize(item.code) === normalize(clean.code) || normalize(item.name) === normalize(clean.name))); if (duplicate) throw new InventoryDomainError('DUPLICATE', '仓库编码或名称已存在')
      const existing = id ? warehouseById(state, id) : null
      if (existing && existing.status === 'enabled' && clean.status === 'disabled') { const nonzero = state.balances.some((item) => item.warehouseId === id && item.quantityMilli > 0); const enabledLocation = state.locations.some((item) => item.warehouseId === id && item.status === 'enabled'); if (nonzero || enabledLocation) throw new InventoryDomainError('INVALID_STATE', '存在非零库存或启用库位，不能禁用仓库') }
      const value: Warehouse = existing ? { ...existing, ...clean, updatedAt: deps.now() } : { ...clean, id: deps.nextId('warehouse'), enterpriseId: state.enterpriseId, createdAt: deps.now(), updatedAt: deps.now() }
      if (existing) state.warehouses[state.warehouses.findIndex((item) => item.id === id)] = value; else state.warehouses.push(value)
      state.changeLogs.push({ id: deps.nextId('log'), enterpriseId: state.enterpriseId, action: 'warehouse.saved', targetId: value.id, operatorId: actor.actorId, detail: existing ? '编辑仓库' : '新增仓库', createdAt: deps.now() }); return value
    })
  }

  function saveLocation(actor: InventoryActor, draft: LocationDraft, id?: string): InventoryLocation {
    assertWrite(actor); assertLocationDraft(draft); const clean = { ...draft, code: draft.code.trim(), name: draft.name.trim(), note: draft.note?.trim() || null }
    return deps.repository.transact((state) => {
      const warehouse = warehouseById(state, clean.warehouseId); if (warehouse.status !== 'enabled') throw new InventoryDomainError('INVALID_STATE', '只能在启用仓库保存库位')
      const duplicate = state.locations.find((item) => item.id !== id && item.warehouseId === clean.warehouseId && (normalize(item.code) === normalize(clean.code) || normalize(item.name) === normalize(clean.name))); if (duplicate) throw new InventoryDomainError('DUPLICATE', '仓内库位编码或名称已存在')
      const existing = id ? locationById(state, id) : null; const nonzero = id ? state.balances.some((item) => item.locationId === id && item.quantityMilli > 0) : false
      if (existing && nonzero && (existing.warehouseId !== clean.warehouseId || clean.status === 'disabled')) throw new InventoryDomainError('INVALID_STATE', '库位有非零库存，不能换仓或禁用')
      const value: InventoryLocation = existing ? { ...existing, ...clean, updatedAt: deps.now() } : { ...clean, id: deps.nextId('location'), enterpriseId: state.enterpriseId, createdAt: deps.now(), updatedAt: deps.now() }
      if (existing) state.locations[state.locations.findIndex((item) => item.id === id)] = value; else state.locations.push(value)
      state.changeLogs.push({ id: deps.nextId('log'), enterpriseId: state.enterpriseId, action: 'location.saved', targetId: value.id, operatorId: actor.actorId, detail: existing ? '编辑库位' : '新增库位', createdAt: deps.now() }); return value
    })
  }

  function previewLocationImport(actor: InventoryActor, rows: LocationImportRow[]): LocationImportPreview {
    assertWrite(actor); const state = deps.repository.read(); const errors: string[] = []; const seen = new Set<string>(); const cleaned = rows.map((row) => ({ ...row, warehouseCode: row.warehouseCode.trim(), locationCode: row.locationCode.trim(), locationName: row.locationName.trim(), note: row.note?.trim() || null }))
    cleaned.forEach((row, index) => { const line = index + 2; const warehouse = state.warehouses.find((item) => normalize(item.code) === normalize(row.warehouseCode)); if (!warehouse || warehouse.status !== 'enabled') errors.push(`第 ${line} 行：仓库不存在或已禁用`); const issues = [{ value: row.locationCode, name: 'locationCode' }, { value: row.locationName, name: 'locationName' }].filter((item) => !item.value || item.value.length > 40); issues.forEach((item) => errors.push(`第 ${line} 行：${item.name} 必填且不超过40字`)); if (!['enabled', 'disabled'].includes(row.status)) errors.push(`第 ${line} 行：status 只能是 enabled/disabled`); if ((row.note?.length ?? 0) > 500) errors.push(`第 ${line} 行：note 不能超过500字`); if (warehouse) { const keys = [`${warehouse.id}|code|${normalize(row.locationCode)}`, `${warehouse.id}|name|${normalize(row.locationName)}`]; keys.forEach((key) => { if (seen.has(key) || state.locations.some((item) => `${item.warehouseId}|code|${normalize(item.code)}` === key || `${item.warehouseId}|name|${normalize(item.name)}` === key)) errors.push(`第 ${line} 行：仓内库位编码或名称重复`); seen.add(key) }) } })
    return { rows: cleaned, errors }
  }

  function importLocations(actor: InventoryActor, rows: LocationImportRow[]): InventoryLocation[] {
    const preview = previewLocationImport(actor, rows); if (preview.errors.length) throw new InventoryValidationError(preview.errors.map((message) => ({ path: 'csv', message })))
    return deps.repository.transact((state) => { const result = preview.rows.map((row) => { const warehouse = state.warehouses.find((item) => normalize(item.code) === normalize(row.warehouseCode))!; const value: InventoryLocation = { id: deps.nextId('location'), enterpriseId: state.enterpriseId, warehouseId: warehouse.id, code: row.locationCode, name: row.locationName, status: row.status, note: row.note, createdAt: deps.now(), updatedAt: deps.now() }; state.locations.push(value); return value }); state.changeLogs.push({ id: deps.nextId('log'), enterpriseId: state.enterpriseId, action: 'location.imported', targetId: result.map((item) => item.id).join(','), operatorId: actor.actorId, detail: `导入 ${result.length} 个库位`, createdAt: deps.now() }); return result })
  }

  function eligibleBalances(state: InventoryFeatureState, warehouseId: string, skuId: string) {
    return state.balances.filter((item) => item.warehouseId === warehouseId && item.skuId === skuId && item.quantityMilli > 0).map((balance) => ({ balance, batch: state.batches.find((item) => item.id === balance.batchId)! })).filter((item) => calculateBatchStatus(item.batch, deps.now()) !== 'expired').sort((a, b) => (a.batch.productionDate === null ? 1 : b.batch.productionDate === null ? -1 : a.batch.productionDate.localeCompare(b.batch.productionDate)) || a.batch.receivedAt.localeCompare(b.batch.receivedAt) || a.batch.batchNumber.localeCompare(b.batch.batchNumber) || a.balance.id.localeCompare(b.balance.id))
  }

  function previewOutbound(actor: InventoryActor, input: Pick<ConfirmOutboundInput, 'warehouseId' | 'skuId' | 'quantityMilli'>): FifoAllocation[] {
    assertWrite(actor); positiveMilli(input.quantityMilli); const state = deps.repository.read(); warehouseById(state, input.warehouseId); if (!deps.catalog.getSku(input.skuId)) throw new InventoryDomainError('PRODUCT_UNAVAILABLE', 'SKU 不存在')
    let remaining = input.quantityMilli; const result: FifoAllocation[] = []
    for (const item of eligibleBalances(state, input.warehouseId, input.skuId)) { const quantityMilli = Math.min(remaining, item.balance.quantityMilli); result.push({ balanceId: item.balance.id, batchId: item.batch.id, batchNumber: item.batch.batchNumber, locationId: item.balance.locationId, quantityMilli }); remaining -= quantityMilli; if (remaining === 0) break }
    if (remaining > 0) throw new InventoryDomainError('INSUFFICIENT_STOCK', '可出库的非过期库存不足')
    return result
  }

  function confirmOutbound(actor: InventoryActor, input: ConfirmOutboundInput): InventoryMovementRow[] {
    assertWrite(actor); if (!deps.catalog.sourceExists(input.sourceType, input.sourceId)) throw new InventoryDomainError('SOURCE_NOT_FOUND', '业务来源不存在')
    const existing = deps.repository.read().movements.filter((item) => item.requestId === input.requestId); if (existing.length) return listMovements(actor).filter((item) => item.requestId === input.requestId)
    const allocation = previewOutbound(actor, input)
    deps.repository.transact((state) => { for (const part of allocation) { const balance = state.balances.find((item) => item.id === part.balanceId)!; const batch = state.batches.find((item) => item.id === part.batchId)!; balance.quantityMilli -= part.quantityMilli; balance.updatedAt = input.occurredAt; state.movements.push({ id: deps.nextId('movement'), enterpriseId: state.enterpriseId, requestId: input.requestId, sourceType: input.sourceType, sourceId: input.sourceId, direction: 'outbound', warehouseId: input.warehouseId, locationId: part.locationId, skuId: input.skuId, batchId: part.batchId, quantityMilli: part.quantityMilli, balanceAfterMilli: balance.quantityMilli, costPerBaseUnitCents: batch.costPerBaseUnitCents, operatorId: input.operatorId, occurredAt: input.occurredAt }) } })
    return listMovements(actor).filter((item) => item.requestId === input.requestId)
  }

  function confirmInbound(actor: InventoryActor, input: ConfirmInboundInput): InventoryMovementRow[] {
    assertWrite(actor); positiveMilli(input.quantityMilli); if (!Number.isSafeInteger(input.costPerBaseUnitCents) || input.costPerBaseUnitCents < 0) throw new InventoryValidationError([{ path: 'costPerBaseUnitCents', message: '必须是非负整数分' }]); if (!deps.catalog.sourceExists(input.sourceType, input.sourceId)) throw new InventoryDomainError('SOURCE_NOT_FOUND', '业务来源不存在')
    const existing = deps.repository.read().movements.filter((item) => item.requestId === input.requestId); if (existing.length) return listMovements(actor).filter((item) => item.requestId === input.requestId)
    const sku = deps.catalog.getSku(input.skuId); if (!sku) throw new InventoryDomainError('PRODUCT_UNAVAILABLE', 'SKU 不存在'); const tracked = sku.manageProductionDate || sku.shelfLifeDays !== null
    if (tracked && (!input.batchNumber?.trim() || !input.productionDate)) throw new InventoryValidationError([{ path: 'batch', message: '该商品必须填写批次号和生产日期' }])
    return deps.repository.transact((state) => {
      const warehouse = warehouseById(state, input.warehouseId); const location = locationById(state, input.locationId); if (warehouse.status !== 'enabled' || location.status !== 'enabled' || location.warehouseId !== warehouse.id) throw new InventoryDomainError('INVALID_STATE', '仓库或库位不可用于入库')
      const batchNumber = tracked ? input.batchNumber!.trim() : `SYSTEM-NONTRACKED-${input.skuId}`; const expiresOn = tracked && sku.shelfLifeDays !== null ? (input.expiresOn ?? addDays(input.productionDate!, sku.shelfLifeDays)) : (input.expiresOn ?? null)
      if (input.productionDate && input.productionDate > datePart(input.occurredAt)) throw new InventoryValidationError([{ path: 'productionDate', message: '不能晚于入库日期' }]); if (input.productionDate && expiresOn && expiresOn < input.productionDate) throw new InventoryValidationError([{ path: 'expiresOn', message: '不能早于生产日期' }])
      let batch = state.batches.find((item) => item.skuId === input.skuId && normalize(item.batchNumber) === normalize(batchNumber))
      if (batch && (batch.productionDate !== (input.productionDate ?? null) || batch.expiresOn !== expiresOn)) throw new InventoryDomainError('DUPLICATE', '同一 SKU 批次号已有不同日期资料')
      if (!batch) { batch = { id: deps.nextId('batch'), enterpriseId: state.enterpriseId, skuId: input.skuId, batchNumber, tracked, productionDate: input.productionDate ?? null, expiresOn, receivedAt: input.occurredAt, costPerBaseUnitCents: input.costPerBaseUnitCents }; state.batches.push(batch) }
      let balance = state.balances.find((item) => item.warehouseId === input.warehouseId && item.locationId === input.locationId && item.skuId === input.skuId && item.batchId === batch!.id)
      if (!balance) { balance = { id: deps.nextId('balance'), enterpriseId: state.enterpriseId, warehouseId: input.warehouseId, locationId: input.locationId, skuId: input.skuId, batchId: batch.id, quantityMilli: 0, updatedAt: input.occurredAt }; state.balances.push(balance) }
      balance.quantityMilli += input.quantityMilli; balance.updatedAt = input.occurredAt; state.movements.push({ id: deps.nextId('movement'), enterpriseId: state.enterpriseId, requestId: input.requestId, sourceType: input.sourceType, sourceId: input.sourceId, direction: 'inbound', warehouseId: input.warehouseId, locationId: input.locationId, skuId: input.skuId, batchId: batch.id, quantityMilli: input.quantityMilli, balanceAfterMilli: balance.quantityMilli, costPerBaseUnitCents: input.costPerBaseUnitCents, operatorId: input.operatorId, occurredAt: input.occurredAt }); return [] as InventoryMovementRow[]
    }), listMovements(actor).filter((item) => item.requestId === input.requestId)
  }

  function exportStocksCsv(actor: InventoryActor, query: InventoryQuery, selected: string[] = []): string {
    assertWrite(actor); let rows = listStocks(actor, { ...query, page: 1 }).items; if (selected.length) rows = rows.filter((item) => selected.includes(`${item.warehouse.id}:${item.skuId}`)); const headers = ['warehouseCode', 'warehouseName', 'skuCode', 'productName', 'currentBaseQuantity', 'pendingOutbound', 'available', 'inTransit', 'status', 'costPerBaseUnitCents', 'amountCents']; const body = rows.map((row) => [row.warehouse.code, row.warehouse.name, row.sku?.skuCode ?? row.skuId, row.sku?.productName ?? '商品资料不可用', row.currentMilli / 1000, 'unavailable', 'unavailable', 'unavailable', row.status, row.costPerBaseUnitCents ?? '', row.amountCents ?? ''].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')); return `\uFEFF${[headers.join(','), ...body].join('\r\n')}`
  }

  function exportLocationsCsv(actor: InventoryActor, selected: string[] = []): string {
    assertWrite(actor); const state = deps.repository.read(); let locations = state.locations
    if (selected.length) locations = locations.filter((item) => selected.includes(item.id))
    const headers = ['warehouseCode', 'locationCode', 'locationName', 'status', 'note']
    const body = locations.map((item) => { const warehouse = warehouseById(state, item.warehouseId); return [warehouse.code, item.code, item.name, item.status, item.note ?? ''].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',') })
    return `\uFEFF${[headers.join(','), ...body].join('\r\n')}`
  }

  return { listStocks, listBatches, listMovements, getWorkspace, saveThreshold, saveWarehouse, saveLocation, previewLocationImport, importLocations, previewOutbound, confirmOutbound, confirmInbound, exportStocksCsv, exportLocationsCsv }
}
