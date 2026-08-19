import { assertSupplierDraft, assertSupplierProductDraft, normalizeSupplierDraft, validateSupplierDraft } from '../schemas/procurement-schema'
import type { ProcurementRepository } from '../repositories/procurement-repository'
import type {
  DirectDeliveryAvailability, ImportIssue, ProcurementActor, ProcurementCatalogProvider, ProcurementFeatureState,
  ProcurementSupplyProvider, ProcurementWorkspace, PurchaseSupplyCandidate, Supplier, SupplierDetail, SupplierDraft,
  SupplierImportPreview, SupplierImportRow, SupplierListItem, SupplierListQuery, SupplierProductDraft,
  SupplierProductListItem, SupplierProductListQuery, SupplierProductRelation, WriteCommand,
} from '../types'

export class ProcurementDomainError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = 'ProcurementDomainError' }
}

interface ProcurementServiceDependencies { repository: ProcurementRepository; catalog: ProcurementCatalogProvider; now(): string; nextId(kind: string): string }

const directDeliveryUnavailable = (): DirectDeliveryAvailability => ({ availability: 'unavailable', reason: 'PURCHASE_EXECUTION_PROVIDER_UNAVAILABLE', message: '采购直送执行数据尚未接入' })
const canAccess = (actor: ProcurementActor) => actor.role === 'super-admin' || actor.role === 'warehouse'
const requireAccess = (actor: ProcurementActor): void => { if (!canAccess(actor)) throw new ProcurementDomainError('PROCUREMENT_PERMISSION_DENIED', '当前角色无权访问采购供应商功能') }
const requireRequestId = (requestId: string): void => { if (!requestId.trim()) throw new ProcurementDomainError('REQUEST_ID_REQUIRED', 'requestId 不能为空') }
const normalize = (value: string) => value.trim().toLocaleLowerCase()
const csvCell = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`
const maskBankAccount = (value: string | null): string | null => value ? `****${value.slice(-4)}` : null

function projectSupplier(state: ProcurementFeatureState, supplier: Supplier, actor: ProcurementActor): SupplierListItem {
  return { ...supplier, bankAccount: actor.role === 'super-admin' ? supplier.bankAccount : maskBankAccount(supplier.bankAccount), enabledProductCount: state.supplierProducts.filter((item) => item.supplierId === supplier.id && item.status === 'enabled').length }
}

export function createProcurementService(deps: ProcurementServiceDependencies) {
  const { repository, catalog, now, nextId } = deps

  function findReplay<T extends Supplier | SupplierProductRelation>(state: ProcurementFeatureState, requestId: string, command: string): T | null {
    const record = state.requests.find((item) => item.requestId === requestId)
    if (!record) return null
    if (record.command !== command) throw new ProcurementDomainError('REQUEST_ID_REUSED', '同一 requestId 不能用于不同命令')
    return structuredClone(record.result) as T
  }

  function recordRequest(state: ProcurementFeatureState, requestId: string, command: string, result: Supplier | SupplierProductRelation): void {
    state.requests.push({ requestId, command, targetId: result.id, resultVersion: result.version, result: structuredClone(result) })
  }

  function audit(state: ProcurementFeatureState, actor: ProcurementActor, targetType: 'supplier' | 'supplier-product', targetId: string, action: string, detail: string): void {
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
    const value = normalizeSupplierDraft(command.value); assertSupplierDraft(value)
    return repository.transact((state) => {
      const replay = findReplay<Supplier>(state, command.requestId, 'supplier.create'); if (replay) return replay
      if (state.suppliers.some((item) => item.code.toUpperCase() === value.code)) throw new ProcurementDomainError('SUPPLIER_CODE_DUPLICATE', '供应商编码已存在')
      if (state.suppliers.some((item) => item.name === value.name)) throw new ProcurementDomainError('SUPPLIER_NAME_DUPLICATE', '供应商名称已存在')
      const supplier: Supplier = { ...value, id: nextId('supplier'), enterpriseId: state.enterpriseId, status: 'enabled', externalAccountState: 'unavailable', version: 1, createdAt: now(), updatedAt: now() }
      state.suppliers.push(supplier); audit(state, actor, 'supplier', supplier.id, 'supplier.created', `创建供应商 ${supplier.code}`); recordRequest(state, command.requestId, 'supplier.create', supplier); return supplier
    })
  }

  function updateSupplier(actor: ProcurementActor, id: string, command: WriteCommand<SupplierDraft>): Supplier {
    requireAccess(actor); requireRequestId(command.requestId); const value = normalizeSupplierDraft(command.value); assertSupplierDraft(value)
    return repository.transact((state) => {
      const replay = findReplay<Supplier>(state, command.requestId, 'supplier.update'); if (replay) return replay
      const supplier = state.suppliers.find((item) => item.id === id); if (!supplier) throw new ProcurementDomainError('SUPPLIER_NOT_FOUND', '供应商不存在')
      if (supplier.version !== command.expectedVersion) throw new ProcurementDomainError('VERSION_CONFLICT', '供应商已被其他操作修改，请刷新后重试')
      if (value.code !== supplier.code) throw new ProcurementDomainError('SUPPLIER_CODE_IMMUTABLE', '供应商编码创建后不可修改')
      if (state.suppliers.some((item) => item.id !== id && item.name === value.name)) throw new ProcurementDomainError('SUPPLIER_NAME_DUPLICATE', '供应商名称已存在')
      Object.assign(supplier, value, { version: supplier.version + 1, updatedAt: now() }); audit(state, actor, 'supplier', id, 'supplier.updated', `更新供应商 ${supplier.code}（银行资料未写入日志）`); recordRequest(state, command.requestId, 'supplier.update', supplier); return supplier
    })
  }

  function setSupplierStatus(actor: ProcurementActor, id: string, status: 'enabled' | 'disabled', expectedVersion: number, requestId: string): Supplier {
    requireAccess(actor); requireRequestId(requestId); const commandName = `supplier.${status}`
    return repository.transact((state) => {
      const replay = findReplay<Supplier>(state, requestId, commandName); if (replay) return replay
      const supplier = state.suppliers.find((item) => item.id === id); if (!supplier) throw new ProcurementDomainError('SUPPLIER_NOT_FOUND', '供应商不存在')
      if (supplier.version !== expectedVersion) throw new ProcurementDomainError('VERSION_CONFLICT', '供应商已被其他操作修改，请刷新后重试')
      supplier.status = status; supplier.version += 1; supplier.updatedAt = now(); audit(state, actor, 'supplier', id, commandName, `${status === 'enabled' ? '启用' : '停用'}供应商 ${supplier.code}`); recordRequest(state, requestId, commandName, supplier); return supplier
    })
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
      if (command.value.preferred) state.supplierProducts.filter((item) => item.skuId === sku.skuId && item.status === 'enabled').forEach((item) => { item.preferred = false })
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
      const before = relation.supplyPriceCents; if (value.preferred) state.supplierProducts.filter((item) => item.id !== id && item.skuId === relation.skuId && item.status === 'enabled').forEach((item) => { item.preferred = false })
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
      if (state.requests.some((item) => item.requestId === requestId)) throw new ProcurementDomainError('REQUEST_ID_REUSED', '该导入 requestId 已使用')
      const created = preview.rows.map((row) => { const { rowNumber: _rowNumber, ...value } = row; const supplier: Supplier = { ...value, id: nextId('supplier'), enterpriseId: state.enterpriseId, status: 'enabled', externalAccountState: 'unavailable', version: 1, createdAt: now(), updatedAt: now() }; state.suppliers.push(supplier); audit(state, actor, 'supplier', supplier.id, 'supplier.imported', `导入供应商 ${supplier.code}`); return supplier })
      if (created[0]) recordRequest(state, requestId, 'supplier.import', created[0]); return created
    })
  }

  function exportSuppliersCsv(actor: ProcurementActor, query: SupplierListQuery = {}): string {
    requireAccess(actor); const rows = listSuppliers(actor, { ...query, page: 1, pageSize: 100 }).items
    return ['供应商编码,供应商名称,交易类型,供货方式,联系人,电话,地址,开户行,银行账号,状态', ...rows.map((row) => [row.code, row.name, row.tradeType, row.deliveryMode, row.contactName, row.contactPhone, row.address ?? '', row.bankName ?? '', row.bankAccount ?? '', row.status].map(csvCell).join(','))].join('\r\n')
  }

  function exportSupplierProductsCsv(actor: ProcurementActor, query: SupplierProductListQuery = {}): string {
    requireAccess(actor); return ['供应商,商品编码,商品名称,SKU编码,规格,采购单位,供应价(分),首选,状态', ...listSupplierProducts(actor, query).map((row) => [row.supplierName, row.productCodeSnapshot, row.productNameSnapshot, row.skuCodeSnapshot, row.specificationSnapshot, row.procurementUnitNameSnapshot, row.supplyPriceCents, row.preferred ? '是' : '否', row.status].map(csvCell).join(','))].join('\r\n')
  }

  function createSupplyProvider(): ProcurementSupplyProvider {
    const listCandidates = (skuId: string, mode?: 'warehouse' | 'direct'): PurchaseSupplyCandidate[] => {
      const sku = catalog.getSku(skuId); if (!sku || sku.deleted || sku.productStatus !== 'on-sale') return []
      const state = repository.read(); return state.supplierProducts.filter((relation) => relation.skuId === skuId && relation.status === 'enabled').flatMap((relation) => { const supplier = state.suppliers.find((item) => item.id === relation.supplierId); if (!supplier || supplier.status !== 'enabled' || (mode && supplier.deliveryMode !== 'both' && supplier.deliveryMode !== mode)) return []; return [{ supplierId: supplier.id, supplierCode: supplier.code, supplierName: supplier.name, deliveryMode: supplier.deliveryMode, relationId: relation.id, skuId, supplyPriceCents: relation.supplyPriceCents, procurementUnitId: relation.procurementUnitId, procurementUnitName: relation.procurementUnitNameSnapshot, procurementUnitRateMilli: relation.procurementUnitRateMilli, preferred: relation.preferred }] })
    }
    return { listCandidates, getPreferred: (skuId, mode) => listCandidates(skuId, mode).find((item) => item.preferred) ?? null }
  }

  function getWorkspace(actor: ProcurementActor, supplierQuery: SupplierListQuery = {}, relationQuery: SupplierProductListQuery = {}): ProcurementWorkspace {
    requireAccess(actor); let categories = [] as ReturnType<ProcurementCatalogProvider['listCategories']>; let catalogAvailable = true; let supplierProducts: SupplierProductListItem[] = []
    try { categories = catalog.listCategories(); supplierProducts = listSupplierProducts(actor, relationQuery) } catch { catalogAvailable = false }
    return { suppliers: listSuppliers(actor, supplierQuery), supplierProducts, categories, catalogAvailable, directDelivery: directDeliveryUnavailable() }
  }

  return { listSuppliers, getSupplier, createSupplier, updateSupplier, setSupplierStatus, listSupplierProducts, createSupplierProduct, updateSupplierProduct, setSupplierProductStatus, previewSupplierImport, importSuppliers, exportSuppliersCsv, exportSupplierProductsCsv, createSupplyProvider, getWorkspace, getDirectDeliveryAvailability: directDeliveryUnavailable }
}
