import type { ProcurementFeatureState, SupplierDraft, SupplierProductDraft } from '../types'

export interface ProcurementValidationIssue { path: string; message: string }

export class ProcurementValidationError extends Error {
  readonly code = 'PROCUREMENT_VALIDATION_FAILED'
  constructor(readonly issues: ProcurementValidationIssue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join('；'))
    this.name = 'ProcurementValidationError'
  }
}

function required(issues: ProcurementValidationIssue[], path: string, value: string, max: number): void {
  if (!value.trim()) issues.push({ path, message: '不能为空' })
  if (value.trim().length > max) issues.push({ path, message: `不能超过 ${max} 个字符` })
}

function optional(issues: ProcurementValidationIssue[], path: string, value: string | null, max: number): void {
  if (value !== null && value.trim().length > max) issues.push({ path, message: `不能超过 ${max} 个字符` })
}

export function normalizeSupplierDraft(value: SupplierDraft): SupplierDraft {
  const clean = (text: string | null) => text?.trim() || null
  return { ...value, code: value.code.trim().toUpperCase(), name: value.name.trim(), contactName: value.contactName.trim(), contactPhone: value.contactPhone.trim(), address: clean(value.address), bankName: clean(value.bankName), bankAccount: clean(value.bankAccount), note: clean(value.note) }
}

export function validateSupplierDraft(value: SupplierDraft): ProcurementValidationIssue[] {
  const issues: ProcurementValidationIssue[] = []
  required(issues, 'code', value.code, 30); required(issues, 'name', value.name, 80)
  required(issues, 'contactName', value.contactName, 40); required(issues, 'contactPhone', value.contactPhone, 30)
  optional(issues, 'address', value.address, 200); optional(issues, 'bankName', value.bankName, 80)
  optional(issues, 'bankAccount', value.bankAccount, 50); optional(issues, 'note', value.note, 500)
  if ((value.bankName === null || !value.bankName.trim()) !== (value.bankAccount === null || !value.bankAccount.trim())) issues.push({ path: 'bankName/bankAccount', message: '开户行和银行账号必须同时填写或同时为空' })
  return issues
}

export function assertSupplierDraft(value: SupplierDraft): void { const issues = validateSupplierDraft(value); if (issues.length) throw new ProcurementValidationError(issues) }

export function assertSupplierProductDraft(value: SupplierProductDraft): void {
  const issues: ProcurementValidationIssue[] = []
  if (!value.supplierId.trim()) issues.push({ path: 'supplierId', message: '不能为空' })
  if (!value.skuId.trim()) issues.push({ path: 'skuId', message: '不能为空' })
  if (!Number.isInteger(value.supplyPriceCents) || value.supplyPriceCents <= 0) issues.push({ path: 'supplyPriceCents', message: '必须是大于 0 的整数分' })
  if (issues.length) throw new ProcurementValidationError(issues)
}

export function assertProcurementFeatureState(state: ProcurementFeatureState): void {
  if (state.schemaVersion !== 1 || !state.enterpriseId) throw new ProcurementValidationError([{ path: 'state', message: '采购数据版本无效' }])
  const codes = new Set<string>(); const names = new Set<string>(); const relationKeys = new Set<string>(); const preferred = new Set<string>()
  for (const supplier of state.suppliers) {
    assertSupplierDraft(supplier)
    const code = supplier.code.toUpperCase(); const name = supplier.name.trim()
    if (codes.has(code)) throw new ProcurementValidationError([{ path: 'suppliers.code', message: '企业内必须唯一' }])
    if (names.has(name)) throw new ProcurementValidationError([{ path: 'suppliers.name', message: '企业内必须唯一' }])
    codes.add(code); names.add(name)
    if (!Number.isInteger(supplier.version) || supplier.version < 1) throw new ProcurementValidationError([{ path: 'suppliers.version', message: '必须为正整数' }])
  }
  for (const relation of state.supplierProducts) {
    if (!Number.isInteger(relation.supplyPriceCents) || relation.supplyPriceCents <= 0) throw new ProcurementValidationError([{ path: 'supplierProducts.supplyPriceCents', message: '必须大于 0' }])
    if (!Number.isInteger(relation.procurementUnitRateMilli) || relation.procurementUnitRateMilli <= 0) throw new ProcurementValidationError([{ path: 'supplierProducts.procurementUnitRateMilli', message: '必须大于 0' }])
    const key = `${relation.supplierId}:${relation.skuId}`; if (relationKeys.has(key)) throw new ProcurementValidationError([{ path: 'supplierProducts', message: '供应商与 SKU 关系必须唯一' }]); relationKeys.add(key)
    const supplier = state.suppliers.find((item) => item.id === relation.supplierId)
    if (!supplier) throw new ProcurementValidationError([{ path: 'supplierProducts.supplierId', message: '供应商不存在' }])
    if (relation.preferred && relation.status === 'enabled' && supplier.status === 'enabled') {
      if (preferred.has(relation.skuId)) throw new ProcurementValidationError([{ path: 'supplierProducts.preferred', message: '每个 SKU 最多一个有效首选供应商' }])
      preferred.add(relation.skuId)
    }
  }
}
