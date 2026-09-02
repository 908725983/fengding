import { assertPurchaseReturnDraft, assertSupplierDraft, assertSupplierProductDraft, normalizeSupplierDraft, validateSupplierDraft } from '../schemas/procurement-schema'
import type { ProcurementRepository } from '../repositories/procurement-repository'
import type {
  DirectDeliveryAvailability, ImportIssue, ProcurementActor, ProcurementCatalogProvider, ProcurementFeatureState,
  ProcurementSupplyProvider, ProcurementWorkspace, PurchaseSupplyCandidate, Supplier, SupplierDetail, SupplierDraft,
  SupplierImportPreview, SupplierImportRow, SupplierListItem, SupplierListQuery, SupplierProductDraft,
  SupplierProductListItem, SupplierProductListQuery, SupplierProductRelation, WriteCommand,
  PurchaseInventoryProvider, PurchaseFinanceProvider, PurchaseOrder, PurchaseOrderDraft, PurchaseOrderInboundInput, PurchaseOrderListQuery,
  PurchaseReturn, PurchaseReturnDraft, PurchaseReturnListQuery, PurchaseReturnOutboundInput, PurchaseReturnSource,
} from '../types'

export class ProcurementDomainError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = 'ProcurementDomainError' }
}

export interface ProcurementServiceDependencies { repository: ProcurementRepository; catalog: ProcurementCatalogProvider; now(): string; nextId(kind: string): string; inventory?: PurchaseInventoryProvider; finance?: PurchaseFinanceProvider }

const directDeliveryUnavailable = (): DirectDeliveryAvailability => ({ availability: 'unavailable', reason: 'PURCHASE_EXECUTION_PROVIDER_UNAVAILABLE', message: '采购直送执行数据尚未接入' })
const canAccess = (actor: ProcurementActor) => actor.role === 'super-admin' || actor.role === 'warehouse'
const requireAccess = (actor: ProcurementActor): void => { if (!canAccess(actor)) throw new ProcurementDomainError('PROCUREMENT_PERMISSION_DENIED', '当前角色无权访问采购供应商功能') }
const requireRequestId = (requestId: string): void => { if (!requestId.trim()) throw new ProcurementDomainError('REQUEST_ID_REQUIRED', 'requestId 不能为空') }
const normalize = (value: string) => value.trim().toLocaleLowerCase()
const csvCell = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`
const maskBankAccount = (value: string | null): string | null => value ? `****${value.slice(-4)}` : null
const protectSupplier = (supplier: Supplier, actor: ProcurementActor): Supplier => actor.role === 'warehouse' ? { ...supplier, bankAccount: maskBankAccount(supplier.bankAccount) } : supplier

export function createEmptySupplierDraft(): SupplierDraft { return { code: '', name: '', tradeType: 'purchase', deliveryMode: 'warehouse', contactName: '', contactPhone: '', address: null, bankName: null, bankAccount: null, note: null } }

function nextSupplierCode(state: ProcurementFeatureState): string {
  const next = state.suppliers.reduce((max, supplier) => {
    const match = /^SUP-(\d{6})$/.exec(supplier.code.toUpperCase())
    return match ? Math.max(max, Number(match[1])) : max
  }, 0) + 1
  return `SUP-${String(next).padStart(6, '0')}`
}

function projectSupplier(state: ProcurementFeatureState, supplier: Supplier, actor: ProcurementActor): SupplierListItem {
  return { ...supplier, bankAccount: actor.role === 'super-admin' ? supplier.bankAccount : maskBankAccount(supplier.bankAccount), enabledProductCount: state.supplierProducts.filter((item) => item.supplierId === supplier.id && item.status === 'enabled').length }
}

export function createProcurementService(deps: ProcurementServiceDependencies) {
  const { repository, catalog, now, nextId } = deps

  function findReplay<T extends Supplier | SupplierProductRelation | Supplier[] | PurchaseOrder | PurchaseReturn>(state: ProcurementFeatureState, requestId: string, command: string): T | null {
    const record = state.requests.find((item) => item.requestId === requestId)
    if (!record) return null
    if (record.command !== command) throw new ProcurementDomainError('REQUEST_ID_REUSED', '同一 requestId 不能用于不同命令')
    return structuredClone(record.result) as T
  }

  function recordRequest(state: ProcurementFeatureState, requestId: string, command: string, result: Supplier | SupplierProductRelation | Supplier[] | PurchaseOrder | PurchaseReturn): void {
    const first = Array.isArray(result) ? result[0] : result
    if (!first) throw new ProcurementDomainError('EMPTY_COMMAND_RESULT', '命令没有可记录的结果')
    state.requests.push({ requestId, command, targetId: first.id, resultVersion: first.version, result: structuredClone(result) })
  }

  function audit(state: ProcurementFeatureState, actor: ProcurementActor, targetType: 'supplier' | 'supplier-product' | 'purchase-order' | 'purchase-return', targetId: string, action: string, detail: string): void {
    state.auditLogs.push({ id: nextId('procurement-audit'), enterpriseId: state.enterpriseId, targetType, targetId, action, actorId: actor.actorId, detail, createdAt: now() })
  }

  function listSuppliers(actor: ProcurementActor, query: SupplierListQuery = {}) {
    requireAccess(actor); const state = repository.read(); let rows = [...state.suppliers]
    if (query.status && query.status !== 'all') rows = rows.filter((item) => item.status === query.status)
    if (query.keyword?.trim()) { const key = normalize(query.keyword); rows = rows.filter((item) => [item.code, item.name, item.contactName, item.contactPhone].some((value) => normalize(value).includes(key))) }
    if (query.skuKeyword?.trim()) {
      const key = normalize(query.skuKeyword); const matchedSkuIds = new Set(catalog.listSkus().filter((sku) => [sku.productName, sku.productCode, sku.skuCode, sku.specification, sku.barcode ?? ''].some((value) => normalize(value).includes(key))).map((sku) => sku.skuId))
      const supplierIds = new Set(state.supplierProducts.filter((item) => matchedSkuIds.has(item.skuId)).map((item) => item.supplierId)); rows = rows.filter((item) => supplierIds.has(item.id))
    }
    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
    const page = query.page ?? 1; const pageSize = query.pageSize ?? 30; const total = rows.length
    return { items: rows.slice((page - 1) * pageSize, page * pageSize).map((item) => projectSupplier(state, item, actor)), total, page, pageSize }
  }

  function getSupplier(actor: ProcurementActor, id: string): SupplierDetail {
    requireAccess(actor); const state = repository.read(); const supplier = state.suppliers.find((item) => item.id === id)
    if (!supplier) throw new ProcurementDomainError('SUPPLIER_NOT_FOUND', '供应商不存在')
    return { ...projectSupplier(state, supplier, actor), relations: state.supplierProducts.filter((item) => item.supplierId === id), auditLogs: state.auditLogs.filter((item) => item.targetId === id || (item.targetType === 'supplier-product' && state.supplierProducts.some((relation) => relation.id === item.targetId && relation.supplierId === id))).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) }
  }

  function createSupplier(actor: ProcurementActor, command: WriteCommand<SupplierDraft>): Supplier {
    requireAccess(actor); requireRequestId(command.requestId); if (command.expectedVersion !== 0) throw new ProcurementDomainError('VERSION_CONFLICT', '新建供应商 expectedVersion 必须为 0')
    const result = repository.transact((state) => {
      const replay = findReplay<Supplier>(state, command.requestId, 'supplier.create'); if (replay) return replay
      const normalized = normalizeSupplierDraft(command.value)
      const value = normalized.code ? normalized : { ...normalized, code: nextSupplierCode(state) }
      assertSupplierDraft(value)
      if (state.suppliers.some((item) => item.code.toUpperCase() === value.code)) throw new ProcurementDomainError('SUPPLIER_CODE_DUPLICATE', '供应商编码已存在')
      if (state.suppliers.some((item) => item.name === value.name)) throw new ProcurementDomainError('SUPPLIER_NAME_DUPLICATE', '供应商名称已存在')
      const supplier: Supplier = { ...value, id: nextId('supplier'), enterpriseId: state.enterpriseId, status: 'enabled', externalAccountState: 'unavailable', version: 1, createdAt: now(), updatedAt: now() }
      state.suppliers.push(supplier); audit(state, actor, 'supplier', supplier.id, 'supplier.created', `创建供应商 ${supplier.code}`); recordRequest(state, command.requestId, 'supplier.create', supplier); return supplier
    }); return protectSupplier(result, actor)
  }

  function updateSupplier(actor: ProcurementActor, id: string, command: WriteCommand<SupplierDraft>): Supplier {
    requireAccess(actor); requireRequestId(command.requestId); const value = normalizeSupplierDraft(command.value); assertSupplierDraft(value)
    const result = repository.transact((state) => {
      const replay = findReplay<Supplier>(state, command.requestId, 'supplier.update'); if (replay) return replay
      const supplier = state.suppliers.find((item) => item.id === id); if (!supplier) throw new ProcurementDomainError('SUPPLIER_NOT_FOUND', '供应商不存在')
      if (supplier.version !== command.expectedVersion) throw new ProcurementDomainError('VERSION_CONFLICT', '供应商已被其他操作修改，请刷新后重试')
      if (value.code !== supplier.code) throw new ProcurementDomainError('SUPPLIER_CODE_IMMUTABLE', '供应商编码创建后不可修改')
      if (state.suppliers.some((item) => item.id !== id && item.name === value.name)) throw new ProcurementDomainError('SUPPLIER_NAME_DUPLICATE', '供应商名称已存在')
      const effective = actor.role === 'warehouse' ? { ...value, bankName: supplier.bankName, bankAccount: supplier.bankAccount } : value
      Object.assign(supplier, effective, { version: supplier.version + 1, updatedAt: now() }); audit(state, actor, 'supplier', id, 'supplier.updated', `更新供应商 ${supplier.code}（银行资料未写入日志）`); recordRequest(state, command.requestId, 'supplier.update', supplier); return supplier
    }); return protectSupplier(result, actor)
  }

  function setSupplierStatus(actor: ProcurementActor, id: string, status: 'enabled' | 'disabled', expectedVersion: number, requestId: string): Supplier {
    requireAccess(actor); requireRequestId(requestId); const commandName = `supplier.${status}`
    const result = repository.transact((state) => {
      const replay = findReplay<Supplier>(state, requestId, commandName); if (replay) return replay
      const supplier = state.suppliers.find((item) => item.id === id); if (!supplier) throw new ProcurementDomainError('SUPPLIER_NOT_FOUND', '供应商不存在')
      if (supplier.version !== expectedVersion) throw new ProcurementDomainError('VERSION_CONFLICT', '供应商已被其他操作修改，请刷新后重试')
      supplier.status = status; supplier.version += 1; supplier.updatedAt = now(); audit(state, actor, 'supplier', id, commandName, `${status === 'enabled' ? '启用' : '停用'}供应商 ${supplier.code}`); recordRequest(state, requestId, commandName, supplier); return supplier
    }); return protectSupplier(result, actor)
  }

  function listSupplierProducts(actor: ProcurementActor, query: SupplierProductListQuery = {}): SupplierProductListItem[] {
    requireAccess(actor); const state = repository.read(); let rows = [...state.supplierProducts]
    if (query.supplierId) rows = rows.filter((item) => item.supplierId === query.supplierId)
    if (query.status && query.status !== 'all') rows = rows.filter((item) => item.status === query.status)
    if (query.categoryId) rows = rows.filter((item) => item.categoryIdSnapshot === query.categoryId)
    if (query.keyword?.trim()) { const key = normalize(query.keyword); rows = rows.filter((item) => [item.productNameSnapshot, item.productCodeSnapshot, item.skuCodeSnapshot, item.specificationSnapshot, item.barcodeSnapshot ?? ''].some((value) => normalize(value).includes(key))) }
    return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((item) => { const supplier = state.suppliers.find((entry) => entry.id === item.supplierId)!; return { ...item, supplierName: supplier.name, effectiveForPurchase: supplier.status === 'enabled' && item.status === 'enabled' } })
  }

  function createSupplierProduct(actor: ProcurementActor, command: WriteCommand<SupplierProductDraft>): SupplierProductRelation {
    requireAccess(actor); requireRequestId(command.requestId); if (command.expectedVersion !== 0) throw new ProcurementDomainError('VERSION_CONFLICT', '新建供货关系 expectedVersion 必须为 0'); assertSupplierProductDraft(command.value)
    return repository.transact((state) => {
      const replay = findReplay<SupplierProductRelation>(state, command.requestId, 'supplier-product.create'); if (replay) return replay
      const supplier = state.suppliers.find((item) => item.id === command.value.supplierId); if (!supplier || supplier.status !== 'enabled') throw new ProcurementDomainError('SUPPLIER_NOT_ENABLED', '只能为启用供应商新增供货关系')
      if (state.supplierProducts.some((item) => item.supplierId === command.value.supplierId && item.skuId === command.value.skuId)) throw new ProcurementDomainError('SUPPLIER_PRODUCT_DUPLICATE', '该供应商与 SKU 的供货关系已存在')
      const sku = catalog.getSku(command.value.skuId); if (!sku || sku.deleted || sku.productStatus !== 'on-sale') throw new ProcurementDomainError('SKU_NOT_AVAILABLE', 'SKU 不存在或当前不可采购')
      if (command.value.preferred) state.supplierProducts.filter((item) => item.skuId === sku.skuId && item.status === 'enabled' && item.preferred).forEach((item) => { item.preferred = false; item.version += 1; item.updatedAt = now(); audit(state, actor, 'supplier-product', item.id, 'supplier-product.preferred-cleared', `SKU ${item.skuCodeSnapshot} 首选关系被替换`) })
      const relation: SupplierProductRelation = { id: nextId('supplier-product'), enterpriseId: state.enterpriseId, supplierId: supplier.id, skuId: sku.skuId, productIdSnapshot: sku.productId, productNameSnapshot: sku.productName, productCodeSnapshot: sku.productCode, skuCodeSnapshot: sku.skuCode, specificationSnapshot: sku.specification, barcodeSnapshot: sku.barcode, categoryIdSnapshot: sku.categoryId, procurementUnitId: sku.procurementUnitId, procurementUnitNameSnapshot: sku.procurementUnitName, procurementUnitRateMilli: sku.procurementUnitRateMilli, supplyPriceCents: command.value.supplyPriceCents, preferred: command.value.preferred, status: 'enabled', version: 1, createdAt: now(), updatedAt: now() }
      state.supplierProducts.push(relation); audit(state, actor, 'supplier-product', relation.id, 'supplier-product.created', `建立 ${supplier.code} / ${sku.skuCode} 供货关系，价格 ${relation.supplyPriceCents} 分`); recordRequest(state, command.requestId, 'supplier-product.create', relation); return relation
    })
  }

  function updateSupplierProduct(actor: ProcurementActor, id: string, value: Pick<SupplierProductDraft, 'supplyPriceCents' | 'preferred'>, expectedVersion: number, requestId: string): SupplierProductRelation {
    requireAccess(actor); requireRequestId(requestId); if (!Number.isInteger(value.supplyPriceCents) || value.supplyPriceCents <= 0) throw new ProcurementDomainError('SUPPLY_PRICE_INVALID', '供应价必须是大于 0 的整数分')
    return repository.transact((state) => {
      const replay = findReplay<SupplierProductRelation>(state, requestId, 'supplier-product.update'); if (replay) return replay
      const relation = state.supplierProducts.find((item) => item.id === id); if (!relation) throw new ProcurementDomainError('SUPPLIER_PRODUCT_NOT_FOUND', '供货关系不存在')
      if (relation.version !== expectedVersion) throw new ProcurementDomainError('VERSION_CONFLICT', '供货关系已被其他操作修改，请刷新后重试')
      const supplier = state.suppliers.find((item) => item.id === relation.supplierId)!; if (value.preferred && (supplier.status !== 'enabled' || relation.status !== 'enabled')) throw new ProcurementDomainError('RELATION_NOT_EFFECTIVE', '只有有效供货关系可设为首选')
      const before = relation.supplyPriceCents; if (value.preferred) state.supplierProducts.filter((item) => item.id !== id && item.skuId === relation.skuId && item.status === 'enabled' && item.preferred).forEach((item) => { item.preferred = false; item.version += 1; item.updatedAt = now(); audit(state, actor, 'supplier-product', item.id, 'supplier-product.preferred-cleared', `SKU ${item.skuCodeSnapshot} 首选关系被替换`) })
      relation.supplyPriceCents = value.supplyPriceCents; relation.preferred = value.preferred; relation.version += 1; relation.updatedAt = now(); audit(state, actor, 'supplier-product', id, 'supplier-product.updated', `供应价 ${before} 分 -> ${relation.supplyPriceCents} 分；首选 ${relation.preferred ? '是' : '否'}`); recordRequest(state, requestId, 'supplier-product.update', relation); return relation
    })
  }

  function setSupplierProductStatus(actor: ProcurementActor, id: string, status: 'enabled' | 'disabled', expectedVersion: number, requestId: string): SupplierProductRelation {
    requireAccess(actor); requireRequestId(requestId); const commandName = `supplier-product.${status}`
    return repository.transact((state) => {
      const replay = findReplay<SupplierProductRelation>(state, requestId, commandName); if (replay) return replay
      const relation = state.supplierProducts.find((item) => item.id === id); if (!relation) throw new ProcurementDomainError('SUPPLIER_PRODUCT_NOT_FOUND', '供货关系不存在')
      if (relation.version !== expectedVersion) throw new ProcurementDomainError('VERSION_CONFLICT', '供货关系已被其他操作修改，请刷新后重试')
      const supplier = state.suppliers.find((item) => item.id === relation.supplierId)!; if (status === 'enabled' && supplier.status !== 'enabled') throw new ProcurementDomainError('SUPPLIER_NOT_ENABLED', '供应商停用时不能启用供货关系')
      if (status === 'enabled') { const sku = catalog.getSku(relation.skuId); if (!sku || sku.deleted || sku.productStatus !== 'on-sale') throw new ProcurementDomainError('SKU_NOT_AVAILABLE', 'SKU 当前不可采购，不能启用供货关系') }
      relation.status = status; if (status === 'disabled') relation.preferred = false; relation.version += 1; relation.updatedAt = now(); audit(state, actor, 'supplier-product', id, commandName, `${status === 'enabled' ? '启用' : '停用'} ${relation.skuCodeSnapshot} 供货关系`); recordRequest(state, requestId, commandName, relation); return relation
    })
  }

  function previewSupplierImport(actor: ProcurementActor, rows: SupplierImportRow[]): SupplierImportPreview {
    requireAccess(actor); const state = repository.read(); const issues: ImportIssue[] = []; const normalizedRows = rows.map((row) => ({ ...normalizeSupplierDraft(row), rowNumber: row.rowNumber }))
    const codes = new Set(state.suppliers.map((item) => item.code)); const names = new Set(state.suppliers.map((item) => item.name))
    for (const row of normalizedRows) {
      validateSupplierDraft(row).forEach((issue) => issues.push({ rowNumber: row.rowNumber, field: issue.path, message: issue.message }))
      if (codes.has(row.code)) issues.push({ rowNumber: row.rowNumber, field: 'code', message: '编码重复' }); else codes.add(row.code)
      if (names.has(row.name)) issues.push({ rowNumber: row.rowNumber, field: 'name', message: '名称重复' }); else names.add(row.name)
    }
    return { valid: issues.length === 0, rows: normalizedRows, issues }
  }

  function importSuppliers(actor: ProcurementActor, preview: SupplierImportPreview, requestId: string): Supplier[] {
    requireAccess(actor); requireRequestId(requestId); if (!preview.valid) throw new ProcurementDomainError('IMPORT_PREVIEW_INVALID', '导入预览存在错误，未写入任何数据')
    return repository.transact((state) => {
      const replay = findReplay<Supplier[]>(state, requestId, 'supplier.import'); if (replay) return replay
      const created = preview.rows.map((row) => { const { rowNumber: _rowNumber, ...value } = row; const supplier: Supplier = { ...value, id: nextId('supplier'), enterpriseId: state.enterpriseId, status: 'enabled', externalAccountState: 'unavailable', version: 1, createdAt: now(), updatedAt: now() }; state.suppliers.push(supplier); audit(state, actor, 'supplier', supplier.id, 'supplier.imported', `导入供应商 ${supplier.code}`); return supplier })
      if (created[0]) recordRequest(state, requestId, 'supplier.import', created); return created
    })
  }

  function exportSuppliersCsv(actor: ProcurementActor, query: SupplierListQuery = {}): string {
    requireAccess(actor); const first = listSuppliers(actor, { ...query, page: 1, pageSize: 100 }); const rows = [...first.items]
    for (let page = 2; rows.length < first.total; page += 1) rows.push(...listSuppliers(actor, { ...query, page, pageSize: 100 }).items)
    return ['供应商编码,供应商名称,交易类型,供货方式,联系人,电话,地址,开户行,银行账号,状态', ...rows.map((row) => [row.code, row.name, row.tradeType, row.deliveryMode, row.contactName, row.contactPhone, row.address ?? '', row.bankName ?? '', row.bankAccount ?? '', row.status].map(csvCell).join(','))].join('\r\n')
  }

  function exportSupplierProductsCsv(actor: ProcurementActor, query: SupplierProductListQuery = {}): string {
    requireAccess(actor); return ['供应商,商品编码,商品名称,SKU编码,规格,采购单位,供应价(¥),首选,状态', ...listSupplierProducts(actor, query).map((row) => [row.supplierName, row.productCodeSnapshot, row.productNameSnapshot, row.skuCodeSnapshot, row.specificationSnapshot, row.procurementUnitNameSnapshot, (row.supplyPriceCents / 100).toFixed(2), row.preferred ? '是' : '否', row.status].map(csvCell).join(','))].join('\r\n')
  }

  function createSupplyProvider(): ProcurementSupplyProvider {
    const listCandidates = (skuId: string, mode?: 'warehouse' | 'direct'): PurchaseSupplyCandidate[] => {
      const sku = catalog.getSku(skuId); if (!sku || sku.deleted || sku.productStatus !== 'on-sale') return []
      const state = repository.read(); return state.supplierProducts.filter((relation) => relation.skuId === skuId && relation.status === 'enabled').flatMap((relation) => { const supplier = state.suppliers.find((item) => item.id === relation.supplierId); if (!supplier || supplier.status !== 'enabled' || (mode && supplier.deliveryMode !== 'both' && supplier.deliveryMode !== mode)) return []; return [{ supplierId: supplier.id, supplierCode: supplier.code, supplierName: supplier.name, deliveryMode: supplier.deliveryMode, relationId: relation.id, skuId, supplyPriceCents: relation.supplyPriceCents, procurementUnitId: relation.procurementUnitId, procurementUnitName: relation.procurementUnitNameSnapshot, procurementUnitRateMilli: relation.procurementUnitRateMilli, preferred: relation.preferred }] })
    }
    return { listCandidates, getPreferred: (skuId, mode) => listCandidates(skuId, mode).find((item) => item.preferred) ?? null, listEffectiveSkuIds: (supplierId) => { const state = repository.read(); const supplier = state.suppliers.find((item) => item.id === supplierId); if (!supplier || supplier.status !== 'enabled') return []; return [...new Set(state.supplierProducts.filter((item) => item.supplierId === supplierId && item.status === 'enabled' && catalog.getSku(item.skuId)?.productStatus === 'on-sale').map((item) => item.skuId))] }, listEnabledSuppliers: () => repository.read().suppliers.filter((item) => item.status === 'enabled').map(({ id, name }) => ({ id, name })) }
  }

  const purchaseReadRoles = new Set(['super-admin', 'warehouse', 'sales-supervisor'])
  const purchaseWriteRoles = new Set(['super-admin', 'warehouse'])
  const assertPurchaseRead = (actor: ProcurementActor) => { if (!purchaseReadRoles.has(actor.role)) throw new ProcurementDomainError('PROCUREMENT_PERMISSION_DENIED', '当前角色无权访问采购订单') }
  const assertPurchaseWrite = (actor: ProcurementActor) => { if (!purchaseWriteRoles.has(actor.role)) throw new ProcurementDomainError('PROCUREMENT_PERMISSION_DENIED', '当前角色无权操作采购订单') }
  const dateKey = (value: string) => value.slice(2, 10).replaceAll('-', '')
  function nextPurchaseCode(state: ProcurementFeatureState, at: string): string {
    const prefix = `PO${dateKey(at)}`; const used = (state.purchaseOrders ?? []).map((item) => item.code).filter((code) => code.startsWith(prefix)).map((code) => Number(code.slice(-6))).filter(Number.isInteger)
    return `${prefix}${String((used.length ? Math.max(...used) : 0) + 1).padStart(6, '0')}`
  }
  function nextMovementCode(state: ProcurementFeatureState, kind: 'inbound' | 'outbound', at: string): string {
    const prefix = `${kind === 'inbound' ? 'CGRK' : 'CGCK'}-${dateKey(at)}-`
    const codes = kind === 'inbound'
      ? (state.purchaseInbounds ?? []).map((item) => item.code)
      : (state.purchaseReturns ?? []).flatMap((item) => item.shipments.map((shipment) => shipment.code).filter((code): code is string => Boolean(code)))
    const used = codes.filter((code) => code.startsWith(prefix)).map((code) => Number(code.slice(-5))).filter(Number.isInteger)
    return `${prefix}${String((used.length ? Math.max(...used) : 0) + 1).padStart(5, '0')}`
  }
  function listPurchaseOrders(actor: ProcurementActor, query: PurchaseOrderListQuery = {}) {
    assertPurchaseRead(actor); const rows = [...(repository.read().purchaseOrders ?? [])].filter((item) => query.workflowStatus === undefined || query.workflowStatus === 'all' || item.workflowStatus === query.workflowStatus).filter((item) => query.inboundStatus === undefined || query.inboundStatus === 'all' || item.inboundStatus === query.inboundStatus).filter((item) => !query.warehouseId || item.warehouseId === query.warehouseId).filter((item) => { const key = normalize(query.keyword ?? ''); return !key || [item.code, item.supplierNameSnapshot, ...item.lines.map((line) => `${line.productNameSnapshot} ${line.skuCodeSnapshot}`)].some((value) => normalize(value).includes(key)) }).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
    const page = Math.max(1, query.page ?? 1); const pageSize = query.pageSize ?? 30; return { items: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, pageSize }
  }
  function getPurchaseOrder(actor: ProcurementActor, id: string): PurchaseOrder { assertPurchaseRead(actor); const order = (repository.read().purchaseOrders ?? []).find((item) => item.id === id); if (!order) throw new ProcurementDomainError('PURCHASE_ORDER_NOT_FOUND', '采购订单不存在'); return order }
  function buildOrder(state: ProcurementFeatureState, actor: ProcurementActor, value: PurchaseOrderDraft): PurchaseOrder {
    if (!value.supplierId || !value.warehouseId || !value.lines.length) throw new ProcurementDomainError('PURCHASE_ORDER_INVALID', '供应商、入库仓库和商品明细不能为空')
    const supplier = state.suppliers.find((item) => item.id === value.supplierId); if (!supplier || supplier.status !== 'enabled' || supplier.deliveryMode === 'direct') throw new ProcurementDomainError('SUPPLIER_NOT_ENABLED', '供应商不可用于入仓采购')
    const categories = new Map(catalog.listCategories().map((item) => [item.id, item.name]))
    const inventoryActor = { actorId: actor.actorId, role: actor.role === 'super-admin' ? 'super-admin' as const : 'warehouse' as const }
    const warehouse = deps.inventory?.getWarehouse?.(inventoryActor, value.warehouseId) ?? null
    const lines = value.lines.map((input, index) => {
      if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0) throw new ProcurementDomainError('PURCHASE_ORDER_INVALID', `第 ${index + 1} 行采购数量必须为正整数`)
      const sku = catalog.getSku(input.skuId); if (!sku || sku.deleted || sku.productStatus !== 'on-sale') throw new ProcurementDomainError('PRODUCT_UNAVAILABLE', `第 ${index + 1} 行商品不可采购`)
      const relation = state.supplierProducts.find((item) => item.id === input.supplierRelationId && item.supplierId === supplier.id && item.skuId === sku.skuId && item.status === 'enabled') ?? state.supplierProducts.find((item) => item.supplierId === supplier.id && item.skuId === sku.skuId && item.status === 'enabled' && item.preferred)
      if (!relation) throw new ProcurementDomainError('SUPPLY_RELATION_REQUIRED', `商品 ${sku.skuCode} 尚未与该供应商建立有效供货关系`)
      const unitPriceCents = relation.supplyPriceCents
      if (!Number.isSafeInteger(unitPriceCents) || unitPriceCents <= 0) throw new ProcurementDomainError('PURCHASE_ORDER_INVALID', `第 ${index + 1} 行供货价必须为正整数`)
      if (relation.procurementUnitRateMilli <= 0 || input.quantity * relation.procurementUnitRateMilli > Number.MAX_SAFE_INTEGER) throw new ProcurementDomainError('PURCHASE_ORDER_INVALID', '采购数量换算后超出安全范围')
      const amountCents = Math.round(input.quantity * unitPriceCents)
      return { id: nextId('purchase-order-line'), skuId: sku.skuId, productNameSnapshot: sku.productName, productCodeSnapshot: sku.productCode, skuCodeSnapshot: sku.skuCode, specificationSnapshot: sku.specification, barcodeSnapshot: sku.barcode, categoryIdSnapshot: sku.categoryId, categoryNameSnapshot: categories.get(sku.categoryId) ?? null, baseUnitIdSnapshot: sku.baseUnitId ?? null, baseUnitNameSnapshot: sku.baseUnitName ?? null, procurementUnitId: relation.procurementUnitId, procurementUnitNameSnapshot: relation.procurementUnitNameSnapshot, procurementUnitRateMilli: relation.procurementUnitRateMilli, quantity: input.quantity, baseQuantityMilli: input.quantity * relation.procurementUnitRateMilli, unitPriceCents, amountCents, isGift: Boolean(input.isGift), note: input.note?.trim() || null, receivedQuantity: 0, receivedBaseQuantityMilli: 0, currentStockMilli: null, supplierRelationId: relation.id }
    })
    const original = lines.reduce((sum, line) => sum + line.amountCents, 0); const productDiscount = value.productDiscountCents ?? 0; const otherFee = value.otherFeeCents ?? 0; if (!Number.isSafeInteger(productDiscount) || productDiscount < 0 || !Number.isSafeInteger(otherFee) || otherFee < 0 || productDiscount > original) throw new ProcurementDomainError('PURCHASE_ORDER_INVALID', '优惠和其他费用必须为合法非负金额')
    return { id: nextId('purchase-order'), enterpriseId: state.enterpriseId, code: nextPurchaseCode(state, now()), createdAt: now(), supplierId: supplier.id, supplierNameSnapshot: supplier.name, warehouseId: value.warehouseId, warehouseNameSnapshot: warehouse?.name ?? null, receiverName: value.receiverName?.trim() || null, receiverPhone: value.receiverPhone?.trim() || null, receiverAddress: value.receiverAddress?.trim() || null, workflowStatus: 'pending-review', inboundStatus: 'not-received', paymentStatus: 'unavailable', lines, totalQuantity: lines.reduce((sum, line) => sum + line.quantity, 0), totalAmountCents: original, originalAmountCents: original, productDiscountCents: productDiscount, otherFeeCents: otherFee, orderAmountCents: original - productDiscount + otherFee, note: value.note?.trim() || null, source: value.source ?? 'manual', sourceOrderIds: [...(value.sourceOrderIds ?? [])], version: 1, updatedAt: now(), auditLogIds: [] }
  }
  function createPurchaseOrder(actor: ProcurementActor, command: { value: PurchaseOrderDraft; requestId: string }): PurchaseOrder { assertPurchaseWrite(actor); requireRequestId(command.requestId); const result = repository.transact((state) => { const replay = state.requests.find((item) => item.requestId === command.requestId && item.command === 'purchase-order.create'); if (replay) return replay.result as PurchaseOrder; const order = buildOrder(state, actor, command.value); state.purchaseOrders ??= []; state.purchaseOrders.push(order); audit(state, actor, 'purchase-order', order.id, 'purchase-order.created', `创建采购订单 ${order.code}`); state.requests.push({ requestId: command.requestId, command: 'purchase-order.create', targetId: order.id, resultVersion: order.version, result: structuredClone(order) }); return order }); return result }
  function changePurchaseOrder(actor: ProcurementActor, id: string, action: 'approve' | 'void' | 'cancel', expectedVersion: number, requestId: string): PurchaseOrder { assertPurchaseWrite(actor); requireRequestId(requestId); return repository.transact((state) => { const replay = state.requests.find((item) => item.requestId === requestId && item.command === `purchase-order.${action}`); if (replay) return replay.result as PurchaseOrder; const order = (state.purchaseOrders ?? []).find((item) => item.id === id); if (!order) throw new ProcurementDomainError('PURCHASE_ORDER_NOT_FOUND', '采购订单不存在'); if (order.version !== expectedVersion) throw new ProcurementDomainError('VERSION_CONFLICT', '采购订单已被其他操作修改，请刷新后重试'); if (action === 'approve' && order.workflowStatus !== 'pending-review') throw new ProcurementDomainError('INVALID_STATE', '只有待审核订单可以审核'); if (action === 'void' && order.workflowStatus !== 'pending-review') throw new ProcurementDomainError('INVALID_STATE', '只有待审核订单可以作废'); if (action === 'cancel' && (order.workflowStatus !== 'approved' || order.inboundStatus !== 'not-received')) throw new ProcurementDomainError('INVALID_STATE', '只有未入库的已审核订单可以取消'); order.workflowStatus = action === 'approve' ? 'approved' : action === 'void' ? 'voided' : 'cancelled'; order.version += 1; order.updatedAt = now(); audit(state, actor, 'purchase-order', id, `purchase-order.${action}`, `${action === 'approve' ? '审核' : action === 'void' ? '作废' : '取消'}采购订单 ${order.code}`); state.requests.push({ requestId, command: `purchase-order.${action}`, targetId: id, resultVersion: order.version, result: structuredClone(order) }); return order }) }
  function receivePurchaseOrder(actor: ProcurementActor, input: PurchaseOrderInboundInput): PurchaseOrder {
    assertPurchaseWrite(actor); requireRequestId(input.requestId)
    if (!deps.inventory) throw new ProcurementDomainError('INVENTORY_PROVIDER_UNAVAILABLE', '库存入库服务尚未接入')
    const existing = repository.read().requests.find((item) => item.requestId === input.requestId && item.command === 'purchase-order.receive'); if (existing) return existing.result as PurchaseOrder
    const current = getPurchaseOrder(actor, input.orderId)
    if (current.workflowStatus !== 'approved' || current.inboundStatus === 'received') throw new ProcurementDomainError('INVALID_STATE', '当前采购订单不可入库')
    if (!input.lines.length || new Set(input.lines.map((line) => line.lineId)).size !== input.lines.length) throw new ProcurementDomainError('PURCHASE_ORDER_INVALID', '入库明细不能为空或重复')
    const movements = input.lines.map((line) => { const source = current.lines.find((item) => item.id === line.lineId); if (!source || !Number.isSafeInteger(line.quantity) || line.quantity <= 0 || source.receivedQuantity + line.quantity > source.quantity) throw new ProcurementDomainError('INBOUND_EXCEEDS_ORDER', '入库数量不能超过采购未入库数量'); return { source, line } })
    const purchaseSnapshot = repository.read(); const inventorySnapshot = deps.inventory.snapshot?.(); const financeSnapshot = deps.finance?.checkpoint()
    const supplier = purchaseSnapshot.suppliers.find((item) => item.id === current.supplierId)!
    const inventoryActor = { actorId: input.operatorId, role: actor.role === 'super-admin' ? 'super-admin' as const : 'warehouse' as const }
    const warehouse = deps.inventory.getWarehouse?.(inventoryActor, input.warehouseId) ?? null
    const payableOriginalCents = current.lines.filter((line) => !line.isGift).reduce((sum, line) => sum + line.amountCents, 0)
    const receivedBeforeCents = current.lines.filter((line) => !line.isGift).reduce((sum, line) => sum + line.receivedQuantity * line.unitPriceCents, 0)
    const receivedNowCents = movements.reduce((sum, { source, line }) => sum + (source.isGift ? 0 : line.quantity * source.unitPriceCents), 0)
    const completeAfter = current.lines.every((line) => line.receivedQuantity + (movements.find((item) => item.source.id === line.id)?.line.quantity ?? 0) === line.quantity)
    const cumulativeShare = (total: number, through: number) => payableOriginalCents === 0 ? 0 : Math.floor(total * through / payableOriginalCents)
    const discountCents = (completeAfter ? current.productDiscountCents : cumulativeShare(current.productDiscountCents, receivedBeforeCents + receivedNowCents)) - cumulativeShare(current.productDiscountCents, receivedBeforeCents)
    const otherFeeCents = (completeAfter ? current.otherFeeCents : cumulativeShare(current.otherFeeCents, receivedBeforeCents + receivedNowCents)) - cumulativeShare(current.otherFeeCents, receivedBeforeCents)
    if (discountCents > receivedNowCents + otherFeeCents) throw new ProcurementDomainError('PURCHASE_ORDER_INVALID', '采购优惠超过本次可形成应付金额')
    let discountAssigned = 0; let feeAssigned = 0
    const items = movements.map(({ source, line }, index) => {
      const quantityMilli = line.quantity * source.procurementUnitRateMilli
      const unitPriceCents = source.isGift ? 0 : source.unitPriceCents
      const subtotalCents = source.isGift ? 0 : line.quantity * source.unitPriceCents
      const last = index === movements.length - 1
      const allocatedDiscountCents = last ? discountCents - discountAssigned : receivedNowCents === 0 ? 0 : Math.floor(discountCents * subtotalCents / receivedNowCents)
      const allocatedOtherFeeCents = last ? otherFeeCents - feeAssigned : receivedNowCents === 0 ? 0 : Math.floor(otherFeeCents * subtotalCents / receivedNowCents)
      discountAssigned += allocatedDiscountCents; feeAssigned += allocatedOtherFeeCents
      return { inboundLineId: `${input.requestId}:${source.id}`, purchaseOrderLineId: source.id, skuId: source.skuId, skuCode: source.skuCodeSnapshot, productName: source.productNameSnapshot, specification: source.specificationSnapshot, unitName: source.procurementUnitNameSnapshot, quantity: line.quantity, quantityMilli, unitPriceCents, subtotalCents, allocatedDiscountCents, allocatedOtherFeeCents, amountCents: subtotalCents - allocatedDiscountCents + allocatedOtherFeeCents, isGift: source.isGift, source }
    })
    const goodsAmountCents = items.reduce((sum, item) => sum + item.subtotalCents, 0)
    const inboundCode = nextMovementCode(purchaseSnapshot, 'inbound', input.occurredAt)
    const inboundId = nextId('purchase-inbound')
    try {
      movements.forEach(({ source, line }) => deps.inventory!.confirmInbound(inventoryActor, { requestId: `${input.requestId}:${source.id}`, sourceType: 'purchase-order-inbound', sourceId: current.id, operatorId: input.operatorId, occurredAt: input.occurredAt, warehouseId: input.warehouseId, locationId: input.locationId, skuId: source.skuId, quantityMilli: line.quantity * source.procurementUnitRateMilli, costPerBaseUnitCents: line.costPerBaseUnitCents ?? Math.max(0, Math.round(source.unitPriceCents / source.procurementUnitRateMilli * 1000)), batchNumber: line.batchNumber, productionDate: line.productionDate, expiresOn: line.expiresOn }))
      if (deps.finance) {
        deps.finance.createPayableFromInbound({ requestId: `${input.requestId}:finance`, purchaseOrderId: current.id, purchaseOrderNo: current.code, inboundId, inboundNo: inboundCode, supplierSnapshot: { id: supplier.id, code: supplier.code, name: supplier.name, contactName: supplier.contactName, phone: supplier.contactPhone, paymentTermDays: null }, items: items.map(({ quantity, source, ...item }) => item), goodsAmountCents, discountCents, otherFeeCents, amountCents: goodsAmountCents - discountCents + otherFeeCents, occurredAt: input.occurredAt, paymentTermDays: null, operator: { id: input.operatorId, name: input.operatorId, role: actor.role } })
      }
      return repository.transact((state) => {
        const order = (state.purchaseOrders ?? []).find((item) => item.id === input.orderId)!
        movements.forEach(({ source, line }) => { const stored = order.lines.find((item) => item.id === source.id)!; stored.receivedQuantity += line.quantity; stored.receivedBaseQuantityMilli += line.quantity * stored.procurementUnitRateMilli })
        const complete = order.lines.every((line) => line.receivedQuantity === line.quantity)
        order.inboundStatus = complete ? 'received' : 'partially-received'; order.version += 1; order.updatedAt = input.occurredAt
        state.purchaseInbounds ??= []
        state.purchaseInbounds.push({ id: inboundId, code: inboundCode, requestId: input.requestId, purchaseOrderId: order.id, purchaseOrderCodeSnapshot: order.code, supplierId: supplier.id, supplierCodeSnapshot: supplier.code, supplierNameSnapshot: order.supplierNameSnapshot, warehouseId: input.warehouseId, warehouseNameSnapshot: warehouse?.name ?? order.warehouseNameSnapshot ?? null, occurredAt: input.occurredAt, operatorId: input.operatorId, lines: items.map((item) => ({ id: item.inboundLineId, purchaseOrderLineId: item.purchaseOrderLineId, skuId: item.skuId, productNameSnapshot: item.source.productNameSnapshot, productCodeSnapshot: item.source.productCodeSnapshot, skuCodeSnapshot: item.source.skuCodeSnapshot, specificationSnapshot: item.source.specificationSnapshot, barcodeSnapshot: item.source.barcodeSnapshot ?? null, categoryIdSnapshot: item.source.categoryIdSnapshot ?? null, categoryNameSnapshot: item.source.categoryNameSnapshot ?? null, baseUnitIdSnapshot: item.source.baseUnitIdSnapshot ?? null, baseUnitNameSnapshot: item.source.baseUnitNameSnapshot ?? null, procurementUnitId: item.source.procurementUnitId, procurementUnitNameSnapshot: item.source.procurementUnitNameSnapshot, procurementUnitRateMilli: item.source.procurementUnitRateMilli, quantity: item.quantity, baseQuantityMilli: item.quantityMilli, unitPriceCents: item.unitPriceCents, goodsAmountCents: item.subtotalCents, allocatedDiscountCents: item.allocatedDiscountCents, allocatedOtherFeeCents: item.allocatedOtherFeeCents, amountCents: item.amountCents, isGift: item.isGift })), totalBaseQuantityMilli: items.reduce((sum, item) => sum + item.quantityMilli, 0), goodsAmountCents, allocatedDiscountCents: discountCents, allocatedOtherFeeCents: otherFeeCents, amountCents: goodsAmountCents - discountCents + otherFeeCents })
        audit(state, actor, 'purchase-order', order.id, 'purchase-order.received', `采购订单 ${order.code} 入库${complete ? '完成' : '部分'}，入库单 ${inboundCode}`)
        state.requests.push({ requestId: input.requestId, command: 'purchase-order.receive', targetId: order.id, resultVersion: order.version, result: structuredClone(order) })
        return order
      })
    } catch (error) {
      repository.reset(purchaseSnapshot)
      if (inventorySnapshot !== undefined) deps.inventory.restore?.(inventorySnapshot)
      if (financeSnapshot !== undefined) deps.finance?.restore(financeSnapshot)
      throw error
    }
  }

  const returnReadRoles = new Set(['super-admin', 'warehouse', 'sales-supervisor'])
  const returnWriteRoles = new Set(['super-admin', 'warehouse'])
  const assertReturnRead = (actor: ProcurementActor) => { if (!returnReadRoles.has(actor.role)) throw new ProcurementDomainError('PROCUREMENT_PERMISSION_DENIED', '当前角色无权访问采购退单') }
  const assertReturnWrite = (actor: ProcurementActor) => { if (!returnWriteRoles.has(actor.role)) throw new ProcurementDomainError('PROCUREMENT_PERMISSION_DENIED', '当前角色无权操作采购退单') }
  function nextPurchaseReturnCode(state: ProcurementFeatureState, at: string): string {
    const prefix = `CGTH-${dateKey(at)}-`; const used = (state.purchaseReturns ?? []).map((item) => item.code).filter((code) => code.startsWith(prefix)).map((code) => Number(code.slice(-5))).filter(Number.isInteger)
    return `${prefix}${String((used.length ? Math.max(...used) : 0) + 1).padStart(5, '0')}`
  }
  function effectiveReturnedQuantity(state: ProcurementFeatureState, purchaseOrderLineId: string): number {
    return (state.purchaseReturns ?? []).filter((item) => item.workflowStatus !== 'voided').flatMap((item) => item.lines).filter((line) => line.purchaseOrderLineId === purchaseOrderLineId).reduce((sum, line) => sum + line.quantity, 0)
  }
  function listPurchaseReturnSources(actor: ProcurementActor): PurchaseReturnSource[] {
    assertReturnRead(actor); const state = repository.read()
    return (state.purchaseOrders ?? []).filter((order) => order.workflowStatus === 'approved' && order.inboundStatus !== 'not-received').map((order) => ({ ...order, lines: order.lines.map((line) => ({ ...line, returnableQuantity: Math.max(0, line.receivedQuantity - effectiveReturnedQuantity(state, line.id)) })).filter((line) => line.returnableQuantity > 0) })).filter((order) => order.lines.length > 0).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
  }
  function listPurchaseReturns(actor: ProcurementActor, query: PurchaseReturnListQuery = {}) {
    assertReturnRead(actor); const key = normalize(query.keyword ?? ''); let rows = [...(repository.read().purchaseReturns ?? [])]
    rows = rows.filter((item) => query.workflowStatus === undefined || query.workflowStatus === 'all' || item.workflowStatus === query.workflowStatus).filter((item) => !query.dateFrom || item.returnDate >= query.dateFrom).filter((item) => !query.dateTo || item.returnDate <= query.dateTo).filter((item) => !key || [item.code, item.purchaseOrderCodeSnapshot, item.supplierNameSnapshot, item.createdBy, ...item.lines.map((line) => `${line.productNameSnapshot} ${line.skuCodeSnapshot}`)].some((value) => normalize(value).includes(key))).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
    const page = Math.max(1, query.page ?? 1); const pageSize = query.pageSize ?? 30
    return { items: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, pageSize }
  }
  function getPurchaseReturn(actor: ProcurementActor, id: string): PurchaseReturn {
    assertReturnRead(actor); const value = (repository.read().purchaseReturns ?? []).find((item) => item.id === id); if (!value) throw new ProcurementDomainError('PURCHASE_RETURN_NOT_FOUND', '采购退单不存在'); return value
  }
  function createPurchaseReturn(actor: ProcurementActor, command: { value: PurchaseReturnDraft; requestId: string }): PurchaseReturn {
    assertReturnWrite(actor); requireRequestId(command.requestId); assertPurchaseReturnDraft(command.value, now().slice(0, 10))
    return repository.transact((state) => {
      const replay = findReplay<PurchaseReturn>(state, command.requestId, 'purchase-return.create'); if (replay) return replay
      const order = (state.purchaseOrders ?? []).find((item) => item.id === command.value.purchaseOrderId); if (!order || order.workflowStatus !== 'approved' || order.inboundStatus === 'not-received') throw new ProcurementDomainError('PURCHASE_RETURN_SOURCE_INVALID', '只能关联已有实际入库的已审核采购单')
      const supplier = state.suppliers.find((item) => item.id === order.supplierId); if (!supplier) throw new ProcurementDomainError('SUPPLIER_NOT_FOUND', '原采购单供应商不存在')
      const lines = command.value.lines.map((input) => {
        const source = order.lines.find((item) => item.id === input.purchaseOrderLineId); if (!source) throw new ProcurementDomainError('PURCHASE_RETURN_SOURCE_INVALID', '退货商品不属于原采购单')
        const returnedBefore = effectiveReturnedQuantity(state, source.id); if (returnedBefore + input.quantity > source.receivedQuantity) throw new ProcurementDomainError('RETURN_EXCEEDS_INBOUND', '退货数量不能超过累计有效入库减已生效退采数量')
        const goodsAmountCents = source.isGift ? 0 : input.quantity * source.unitPriceCents
        const payableItems = deps.finance?.listPayablesForPurchaseOrder?.(order.id).flatMap((payable) => payable.items).filter((item) => item.purchaseOrderLineId === source.id) ?? []
        const sourceDiscountTotal = payableItems.reduce((sum, item) => sum + item.allocatedDiscountCents, 0)
        const sourceOtherFeeTotal = payableItems.reduce((sum, item) => sum + item.allocatedOtherFeeCents, 0)
        const priorLines = (state.purchaseReturns ?? []).filter((item) => item.workflowStatus !== 'voided').flatMap((item) => item.lines).filter((line) => line.purchaseOrderLineId === source.id)
        const priorDiscount = priorLines.reduce((sum, line) => sum + line.allocatedDiscountCents, 0); const priorFee = priorLines.reduce((sum, line) => sum + line.allocatedOtherFeeCents, 0)
        const complete = returnedBefore + input.quantity === source.receivedQuantity
        const allocatedDiscountCents = source.isGift ? 0 : (complete ? sourceDiscountTotal : Math.floor(sourceDiscountTotal * (returnedBefore + input.quantity) / source.receivedQuantity)) - priorDiscount
        const allocatedOtherFeeCents = source.isGift ? 0 : (complete ? sourceOtherFeeTotal : Math.floor(sourceOtherFeeTotal * (returnedBefore + input.quantity) / source.receivedQuantity)) - priorFee
        return { id: nextId('purchase-return-line'), purchaseOrderLineId: source.id, skuId: source.skuId, productNameSnapshot: source.productNameSnapshot, productCodeSnapshot: source.productCodeSnapshot, skuCodeSnapshot: source.skuCodeSnapshot, specificationSnapshot: source.specificationSnapshot, barcodeSnapshot: source.barcodeSnapshot ?? null, categoryIdSnapshot: source.categoryIdSnapshot ?? null, categoryNameSnapshot: source.categoryNameSnapshot ?? null, baseUnitIdSnapshot: source.baseUnitIdSnapshot ?? null, baseUnitNameSnapshot: source.baseUnitNameSnapshot ?? null, procurementUnitId: source.procurementUnitId, procurementUnitNameSnapshot: source.procurementUnitNameSnapshot, procurementUnitRateMilli: source.procurementUnitRateMilli, quantity: input.quantity, baseQuantityMilli: input.quantity * source.procurementUnitRateMilli, shippedQuantity: 0, shippedBaseQuantityMilli: 0, unitPriceCents: source.isGift ? 0 : source.unitPriceCents, goodsAmountCents, allocatedDiscountCents, allocatedOtherFeeCents, amountCents: goodsAmountCents - allocatedDiscountCents + allocatedOtherFeeCents, isGift: source.isGift, note: input.note?.trim() || null }
      })
      const value: PurchaseReturn = { id: nextId('purchase-return'), enterpriseId: state.enterpriseId, code: nextPurchaseReturnCode(state, now()), createdAt: now(), returnDate: command.value.returnDate, purchaseOrderId: order.id, purchaseOrderCodeSnapshot: order.code, supplierId: supplier.id, supplierCodeSnapshot: supplier.code, supplierNameSnapshot: supplier.name, supplierContactNameSnapshot: supplier.contactName, supplierContactPhoneSnapshot: supplier.contactPhone, warehouseId: order.warehouseId, workflowStatus: 'pending-review', outboundStatus: 'not-shipped', refundStatus: 'not-required', lines, totalQuantity: lines.reduce((sum, line) => sum + line.quantity, 0), totalBaseQuantityMilli: lines.reduce((sum, line) => sum + line.baseQuantityMilli, 0), goodsAmountCents: lines.reduce((sum, line) => sum + line.goodsAmountCents, 0), allocatedDiscountCents: lines.reduce((sum, line) => sum + line.allocatedDiscountCents, 0), allocatedOtherFeeCents: lines.reduce((sum, line) => sum + line.allocatedOtherFeeCents, 0), amountCents: lines.reduce((sum, line) => sum + line.amountCents, 0), note: command.value.note?.trim() || null, voidInfo: null, shipments: [], createdBy: actor.actorId, approvedBy: null, approvedAt: null, version: 1, updatedAt: now(), auditLogIds: [] }
      state.purchaseReturns ??= []; state.purchaseReturns.push(value); audit(state, actor, 'purchase-return', value.id, 'purchase-return.created', `创建采购退单 ${value.code}，来源 ${order.code}`); recordRequest(state, command.requestId, 'purchase-return.create', value); return value
    })
  }
  function approvePurchaseReturn(actor: ProcurementActor, id: string, expectedVersion: number, requestId: string): PurchaseReturn {
    assertReturnWrite(actor); requireRequestId(requestId); return repository.transact((state) => { const replay = findReplay<PurchaseReturn>(state, requestId, 'purchase-return.approve'); if (replay) return replay; const value = (state.purchaseReturns ?? []).find((item) => item.id === id); if (!value) throw new ProcurementDomainError('PURCHASE_RETURN_NOT_FOUND', '采购退单不存在'); if (value.version !== expectedVersion) throw new ProcurementDomainError('VERSION_CONFLICT', '采购退单已被其他操作修改，请刷新后重试'); if (value.workflowStatus !== 'pending-review') throw new ProcurementDomainError('INVALID_STATE', '只有待审核退单可以审核'); value.workflowStatus = 'approved'; value.approvedBy = actor.actorId; value.approvedAt = now(); value.version += 1; value.updatedAt = now(); audit(state, actor, 'purchase-return', id, 'purchase-return.approved', `审核采购退单 ${value.code}`); recordRequest(state, requestId, 'purchase-return.approve', value); return value })
  }
  function voidPurchaseReturn(actor: ProcurementActor, id: string, expectedVersion: number, reason: string, requestId: string): PurchaseReturn {
    assertReturnWrite(actor); requireRequestId(requestId); const cleanReason = reason.trim(); if (!cleanReason || cleanReason.length > 200) throw new ProcurementDomainError('PURCHASE_RETURN_INVALID', '作废原因必须为 1 到 200 个字符')
    return repository.transact((state) => { const replay = findReplay<PurchaseReturn>(state, requestId, 'purchase-return.void'); if (replay) return replay; const value = (state.purchaseReturns ?? []).find((item) => item.id === id); if (!value) throw new ProcurementDomainError('PURCHASE_RETURN_NOT_FOUND', '采购退单不存在'); if (value.version !== expectedVersion) throw new ProcurementDomainError('VERSION_CONFLICT', '采购退单已被其他操作修改，请刷新后重试'); if (!['pending-review', 'approved'].includes(value.workflowStatus) || value.shipments.length) throw new ProcurementDomainError('INVALID_STATE', '已有有效出库或贷项的采购退单不能作废'); value.workflowStatus = 'voided'; value.voidInfo = { reason: cleanReason, voidedAt: now(), voidedBy: actor.actorId }; value.version += 1; value.updatedAt = now(); audit(state, actor, 'purchase-return', id, 'purchase-return.voided', `作废采购退单 ${value.code}：${cleanReason}`); recordRequest(state, requestId, 'purchase-return.void', value); return value })
  }
  function shipPurchaseReturn(actor: ProcurementActor, input: PurchaseReturnOutboundInput): PurchaseReturn {
    assertReturnWrite(actor); requireRequestId(input.requestId); if (!deps.inventory?.confirmOutboundBatch) throw new ProcurementDomainError('INVENTORY_PROVIDER_UNAVAILABLE', '库存退采出库服务尚未接入'); if (!deps.finance?.listPayablesForPurchaseOrder || !deps.finance.createPayableCredit) throw new ProcurementDomainError('FINANCE_PROVIDER_UNAVAILABLE', '供应商应付贷项服务尚未接入')
    const replay = repository.read().requests.find((item) => item.requestId === input.requestId); if (replay) { if (replay.command !== 'purchase-return.ship') throw new ProcurementDomainError('REQUEST_ID_REUSED', '同一 requestId 不能用于不同命令'); return replay.result as PurchaseReturn }
    const current = getPurchaseReturn(actor, input.returnId); if (current.version !== input.expectedVersion) throw new ProcurementDomainError('VERSION_CONFLICT', '采购退单已被其他操作修改，请刷新后重试'); if (current.workflowStatus !== 'approved') throw new ProcurementDomainError('INVALID_STATE', '只有已审核且未完成的采购退单可以出库'); if (!input.lines.length || new Set(input.lines.map((line) => line.lineId)).size !== input.lines.length) throw new ProcurementDomainError('PURCHASE_RETURN_INVALID', '出库明细不能为空或重复')
    const shipmentLines = input.lines.map((line) => { const source = current.lines.find((item) => item.id === line.lineId); if (!source || !Number.isSafeInteger(line.quantity) || line.quantity <= 0 || source.shippedQuantity + line.quantity > source.quantity) throw new ProcurementDomainError('OUTBOUND_EXCEEDS_RETURN', '出库数量不能超过退单未出库数量'); return { source, quantity: line.quantity, baseQuantityMilli: line.quantity * source.procurementUnitRateMilli } })
    const purchaseSnapshot = repository.read(); const inventorySnapshot = deps.inventory.snapshot?.(); const financeSnapshot = deps.finance.checkpoint(); const payables = deps.finance.listPayablesForPurchaseOrder(current.purchaseOrderId).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id))
    try {
      const allocations = deps.inventory.confirmOutboundBatch({ actorId: input.operatorId, role: actor.role === 'super-admin' ? 'super-admin' : 'warehouse' }, { requestId: `${input.requestId}:inventory`, sourceType: 'purchase-return', sourceId: current.id, operatorId: input.operatorId, occurredAt: input.occurredAt, warehouseId: current.warehouseId, lines: shipmentLines.map((item) => ({ referenceId: item.source.id, skuId: item.source.skuId, quantityMilli: item.baseQuantityMilli })) })
      const credits: PurchaseReturn['shipments'][number]['credits'] = []
      for (const shipmentLine of shipmentLines) {
        let remaining = shipmentLine.baseQuantityMilli
        for (const payable of payables) {
          const payableItem = payable.items.find((item) => item.purchaseOrderLineId === shipmentLine.source.purchaseOrderLineId); if (!payableItem) continue
          const creditedBefore = (purchaseSnapshot.purchaseReturns ?? []).flatMap((item) => item.shipments).flatMap((item) => item.credits).filter((item) => item.payableId === payable.id && item.purchaseOrderLineId === shipmentLine.source.purchaseOrderLineId).reduce((sum, item) => sum + item.quantityMilli, 0)
          const available = payableItem.quantityMilli - creditedBefore; if (available <= 0) continue; const quantityMilli = Math.min(remaining, available); const amountBefore = Math.floor(payableItem.amountCents * creditedBefore / payableItem.quantityMilli); const amountThrough = creditedBefore + quantityMilli === payableItem.quantityMilli ? payableItem.amountCents : Math.floor(payableItem.amountCents * (creditedBefore + quantityMilli) / payableItem.quantityMilli); const amountCents = amountThrough - amountBefore
          if (amountCents > 0) { const credit = deps.finance.createPayableCredit({ requestId: `${input.requestId}:finance:${payable.id}:${shipmentLine.source.id}`, sourceId: current.id, sourceNo: current.code, supplierId: current.supplierId, payableId: payable.id, amountCents, occurredAt: input.occurredAt, operator: { id: input.operatorId, name: input.operatorId, role: actor.role } }); credits.push({ id: nextId('purchase-return-credit'), lineId: shipmentLine.source.id, purchaseOrderLineId: shipmentLine.source.purchaseOrderLineId, payableId: payable.id, quantityMilli, amountCents, financeCreditId: credit.id, outstandingReductionCents: credit.outstandingReductionCents, refundObligationCents: credit.refundObligationCents }) }
          remaining -= quantityMilli; if (remaining === 0) break
        }
        if (remaining > 0) throw new ProcurementDomainError('PAYABLE_ALLOCATION_UNAVAILABLE', '有效入库应付不足，无法完成退采贷项分配')
      }
      return repository.transact((state) => { const value = (state.purchaseReturns ?? []).find((item) => item.id === input.returnId)!; shipmentLines.forEach((item) => { const line = value.lines.find((entry) => entry.id === item.source.id)!; line.shippedQuantity += item.quantity; line.shippedBaseQuantityMilli += item.baseQuantityMilli }); const complete = value.lines.every((line) => line.shippedQuantity === line.quantity); value.outboundStatus = complete ? 'shipped' : 'partially-shipped'; value.refundStatus = credits.some((item) => item.refundObligationCents > 0) || value.shipments.flatMap((item) => item.credits).some((item) => item.refundObligationCents > 0) ? 'pending' : 'not-required'; value.workflowStatus = complete ? 'completed' : 'approved'; const inventoryActor = { actorId: input.operatorId, role: actor.role === 'super-admin' ? 'super-admin' as const : 'warehouse' as const }; const warehouse = deps.inventory!.getWarehouse?.(inventoryActor, value.warehouseId) ?? null; const shipment = { id: nextId('purchase-return-shipment'), code: nextMovementCode(state, 'outbound', input.occurredAt), requestId: input.requestId, occurredAt: input.occurredAt, operatorId: input.operatorId, warehouseNameSnapshot: warehouse?.name ?? null, lines: shipmentLines.map((item) => ({ lineId: item.source.id, quantity: item.quantity, baseQuantityMilli: item.baseQuantityMilli })), inventoryMovementIds: allocations.map((item) => item.movementId).filter((id): id is string => Boolean(id)), credits, amountCents: credits.reduce((sum, item) => sum + item.amountCents, 0) }; value.shipments.push(shipment); value.version += 1; value.updatedAt = input.occurredAt; audit(state, actor, 'purchase-return', value.id, 'purchase-return.shipped', `采购退单 ${value.code} ${complete ? '完成出库' : '部分出库'}，出库单 ${shipment.code}`); recordRequest(state, input.requestId, 'purchase-return.ship', value); return value })
    } catch (error) { repository.reset(purchaseSnapshot); if (inventorySnapshot !== undefined) deps.inventory.restore?.(inventorySnapshot); deps.finance.restore(financeSnapshot); throw error }
  }
  function exportPurchaseReturnsCsv(actor: ProcurementActor, query: PurchaseReturnListQuery = {}): string {
    assertReturnWrite(actor); const first = listPurchaseReturns(actor, { ...query, page: 1, pageSize: 100 }); const rows = [...first.items]; for (let page = 2; rows.length < first.total; page += 1) rows.push(...listPurchaseReturns(actor, { ...query, page, pageSize: 100 }).items)
    return ['退单号,退单日期,原采购单,供应商,退单状态,出库状态,退款状态,退单金额(¥),备注', ...rows.map((item) => [item.code, item.returnDate, item.purchaseOrderCodeSnapshot, item.supplierNameSnapshot, item.workflowStatus, item.outboundStatus, item.refundStatus, (item.amountCents / 100).toFixed(2), item.note ?? ''].map(csvCell).join(','))].join('\r\n')
  }

  function getWorkspace(actor: ProcurementActor, supplierQuery: SupplierListQuery = {}, relationQuery: SupplierProductListQuery = {}): ProcurementWorkspace {
    requireAccess(actor); let categories = [] as ReturnType<ProcurementCatalogProvider['listCategories']>; let skus = [] as ReturnType<ProcurementCatalogProvider['listSkus']>; let catalogAvailable = true; let supplierProducts: SupplierProductListItem[] = []
    try { categories = catalog.listCategories(); skus = catalog.listSkus(); supplierProducts = listSupplierProducts(actor, relationQuery) } catch { catalogAvailable = false }
    return { suppliers: listSuppliers(actor, supplierQuery), supplierProducts, categories, skus, catalogAvailable, directDelivery: directDeliveryUnavailable() }
  }

  return { listSuppliers, getSupplier, createSupplier, updateSupplier, setSupplierStatus, listSupplierProducts, createSupplierProduct, updateSupplierProduct, setSupplierProductStatus, previewSupplierImport, importSuppliers, exportSuppliersCsv, exportSupplierProductsCsv, createSupplyProvider, listPurchaseOrders, getPurchaseOrder, createPurchaseOrder, approvePurchaseOrder: (actor: ProcurementActor, id: string, expectedVersion: number, requestId: string) => changePurchaseOrder(actor, id, 'approve', expectedVersion, requestId), voidPurchaseOrder: (actor: ProcurementActor, id: string, expectedVersion: number, requestId: string) => changePurchaseOrder(actor, id, 'void', expectedVersion, requestId), cancelPurchaseOrder: (actor: ProcurementActor, id: string, expectedVersion: number, requestId: string) => changePurchaseOrder(actor, id, 'cancel', expectedVersion, requestId), receivePurchaseOrder, listPurchaseReturnSources, listPurchaseReturns, getPurchaseReturn, createPurchaseReturn, approvePurchaseReturn, voidPurchaseReturn, shipPurchaseReturn, exportPurchaseReturnsCsv, getWorkspace, getDirectDeliveryAvailability: directDeliveryUnavailable }
}
