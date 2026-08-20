import type { ReplenishmentMode, ReplenishmentQuery } from '../types'

export interface ReplenishmentValidationIssue { path: string; message: string }
export class ReplenishmentValidationError extends Error { constructor(readonly issues: ReplenishmentValidationIssue[]) { super(issues.map((issue) => `${issue.path}: ${issue.message}`).join('；')); this.name = 'ReplenishmentValidationError' } }
export function assertReplenishmentQuery(query: ReplenishmentQuery): void {
  const issues: ReplenishmentValidationIssue[] = []
  if (!(['safety', 'shortage', 'combined'] as ReplenishmentMode[]).includes(query.mode)) issues.push({ path: 'mode', message: '分析方式无效' })
  if (query.categoryId !== undefined && !query.categoryId.trim()) issues.push({ path: 'categoryId', message: '分类 ID 不能为空字符串' })
  if (query.warehouseId !== undefined && !query.warehouseId.trim()) issues.push({ path: 'warehouseId', message: '仓库 ID 不能为空字符串' })
  if (issues.length) throw new ReplenishmentValidationError(issues)
}
export function assertManualReplenishmentQuantity(quantity: number): void {
  if (!Number.isSafeInteger(quantity) || quantity < 0) throw new ReplenishmentValidationError([{ path: 'quantity', message: '必须是非负整数采购单位' }])
}
