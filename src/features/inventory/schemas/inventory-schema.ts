import type { InventoryFeatureState, LocationDraft, WarehouseDraft } from '../types'

export interface InventoryValidationIssue { path: string; message: string }
export class InventoryValidationError extends Error {
  readonly code = 'INVENTORY_VALIDATION_FAILED'
  constructor(readonly issues: InventoryValidationIssue[]) { super(issues.map((item) => `${item.path}: ${item.message}`).join('；')); this.name = 'InventoryValidationError' }
}

function required(issues: InventoryValidationIssue[], path: string, value: string, max = 40): void {
  const text = value.trim()
  if (!text) issues.push({ path, message: '不能为空' })
  else if (text.length > max) issues.push({ path, message: `不能超过 ${max} 个字符` })
}
function optional(issues: InventoryValidationIssue[], path: string, value: string | null, max: number): void {
  if (value !== null && value.trim().length > max) issues.push({ path, message: `不能超过 ${max} 个字符` })
}
function milli(issues: InventoryValidationIssue[], path: string, value: number, allowZero = true): void {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) issues.push({ path, message: `必须是${allowZero ? '非负' : '正'}整数毫单位` })
}

export function validateWarehouseDraft(draft: WarehouseDraft): InventoryValidationIssue[] {
  const issues: InventoryValidationIssue[] = []
  required(issues, 'code', draft.code); required(issues, 'name', draft.name)
  optional(issues, 'contactName', draft.contactName, 40); optional(issues, 'phone', draft.phone, 40)
  optional(issues, 'provinceCode', draft.provinceCode, 40); optional(issues, 'cityCode', draft.cityCode, 40); optional(issues, 'districtCode', draft.districtCode, 40); optional(issues, 'address', draft.address, 200)
  return issues
}
export function assertWarehouseDraft(draft: WarehouseDraft): void { const issues = validateWarehouseDraft(draft); if (issues.length) throw new InventoryValidationError(issues) }

export function validateLocationDraft(draft: LocationDraft): InventoryValidationIssue[] {
  const issues: InventoryValidationIssue[] = []
  required(issues, 'warehouseId', draft.warehouseId, 100); required(issues, 'code', draft.code); required(issues, 'name', draft.name); optional(issues, 'note', draft.note, 500)
  return issues
}
export function assertLocationDraft(draft: LocationDraft): void { const issues = validateLocationDraft(draft); if (issues.length) throw new InventoryValidationError(issues) }

export function assertInventoryFeatureState(state: InventoryFeatureState): void {
  const issues: InventoryValidationIssue[] = []
  if (state.schemaVersion !== 1) issues.push({ path: 'schemaVersion', message: '必须为 1' })
  required(issues, 'enterpriseId', state.enterpriseId, 100)
  const collections = [state.warehouses, state.locations, state.batches, state.balances, state.movements, state.changeLogs]
  for (const collection of collections) {
    const ids = collection.map((item) => item.id)
    if (new Set(ids).size !== ids.length) issues.push({ path: 'entity.id', message: '同集合 ID 必须唯一' })
    if (collection.some((item) => item.enterpriseId !== state.enterpriseId)) issues.push({ path: 'enterpriseId', message: '实体企业不一致' })
  }
  const normalized = (value: string) => value.trim().toLocaleLowerCase()
  if (new Set(state.warehouses.map((item) => normalized(item.code))).size !== state.warehouses.length) issues.push({ path: 'warehouses.code', message: '企业内必须唯一' })
  if (new Set(state.warehouses.map((item) => normalized(item.name))).size !== state.warehouses.length) issues.push({ path: 'warehouses.name', message: '企业内必须唯一' })
  const warehouseIds = new Set(state.warehouses.map((item) => item.id)); const locationIds = new Set(state.locations.map((item) => item.id)); const batchIds = new Set(state.batches.map((item) => item.id))
  for (const warehouse of state.warehouses) validateWarehouseDraft(warehouse).forEach((issue) => issues.push({ ...issue, path: `warehouses.${warehouse.id}.${issue.path}` }))
  for (const location of state.locations) {
    validateLocationDraft(location).forEach((issue) => issues.push({ ...issue, path: `locations.${location.id}.${issue.path}` }))
    if (!warehouseIds.has(location.warehouseId)) issues.push({ path: `locations.${location.id}.warehouseId`, message: '仓库不存在' })
  }
  const locationKeys = state.locations.flatMap((item) => [`${item.warehouseId}|code|${normalized(item.code)}`, `${item.warehouseId}|name|${normalized(item.name)}`])
  if (new Set(locationKeys).size !== locationKeys.length) issues.push({ path: 'locations', message: '仓内编码和名称必须分别唯一' })
  const batchKeys = state.batches.map((item) => `${item.skuId}|${normalized(item.batchNumber)}`)
  if (new Set(batchKeys).size !== batchKeys.length) issues.push({ path: 'batches.batchNumber', message: 'SKU 批次号必须唯一' })
  for (const batch of state.batches) {
    required(issues, `batches.${batch.id}.batchNumber`, batch.batchNumber, 80)
    if (batch.productionDate && Date.parse(batch.productionDate) > Date.parse(batch.receivedAt)) issues.push({ path: `batches.${batch.id}.productionDate`, message: '不能晚于入库时间' })
    if (batch.productionDate && batch.expiresOn && batch.expiresOn < batch.productionDate) issues.push({ path: `batches.${batch.id}.expiresOn`, message: '不能早于生产日期' })
    if (!Number.isSafeInteger(batch.costPerBaseUnitCents) || batch.costPerBaseUnitCents < 0) issues.push({ path: `batches.${batch.id}.costPerBaseUnitCents`, message: '必须是非负整数分' })
  }
  const balanceKeys = state.balances.map((item) => `${item.warehouseId}|${item.locationId}|${item.skuId}|${item.batchId}`)
  if (new Set(balanceKeys).size !== balanceKeys.length) issues.push({ path: 'balances', message: '余额粒度必须唯一' })
  for (const balance of state.balances) {
    milli(issues, `balances.${balance.id}.quantityMilli`, balance.quantityMilli)
    const location = state.locations.find((item) => item.id === balance.locationId); const batch = state.batches.find((item) => item.id === balance.batchId)
    if (!warehouseIds.has(balance.warehouseId)) issues.push({ path: `balances.${balance.id}.warehouseId`, message: '仓库不存在' })
    if (!locationIds.has(balance.locationId) || location?.warehouseId !== balance.warehouseId) issues.push({ path: `balances.${balance.id}.locationId`, message: '库位不属于仓库' })
    if (!batchIds.has(balance.batchId) || batch?.skuId !== balance.skuId) issues.push({ path: `balances.${balance.id}.batchId`, message: '批次不属于 SKU' })
  }
  for (const item of state.thresholds) {
    milli(issues, `thresholds.${item.warehouseId}.${item.skuId}.safetyMinimumMilli`, item.safetyMinimumMilli)
    if (item.maximumMilli !== null) { milli(issues, 'thresholds.maximumMilli', item.maximumMilli); if (item.maximumMilli <= item.safetyMinimumMilli) issues.push({ path: 'thresholds.maximumMilli', message: '必须大于安全下限' }) }
  }
  for (const item of state.openingBalances) { if (!/^\d{4}-\d{2}$/.test(item.month)) issues.push({ path: 'openingBalances.month', message: '必须为 YYYY-MM' }); milli(issues, 'openingBalances.quantityMilli', item.quantityMilli) }
  const requestDirections = new Map<string, string>()
  for (const movement of state.movements) {
    milli(issues, `movements.${movement.id}.quantityMilli`, movement.quantityMilli, false); milli(issues, `movements.${movement.id}.balanceAfterMilli`, movement.balanceAfterMilli)
    const existing = requestDirections.get(movement.requestId); if (existing && existing !== movement.direction) issues.push({ path: `movements.${movement.id}.requestId`, message: '同 requestId 方向不一致' }); requestDirections.set(movement.requestId, movement.direction)
  }
  if (issues.length) throw new InventoryValidationError(issues)
}
