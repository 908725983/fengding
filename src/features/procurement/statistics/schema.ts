import { ProcurementValidationError, type ProcurementValidationIssue } from '../schemas/procurement-schema'
import type { PurchaseStatisticsQuery, PurchaseStatisticsReportKey } from './types'

export const purchaseStatisticsReports = new Set<PurchaseStatisticsReportKey>([
  'purchase-order-line-detail', 'purchase-order-by-supplier', 'purchase-movement-line-detail',
  'purchase-movement-by-product', 'purchase-movement-by-supplier',
])

const datePattern = /^\d{4}-\d{2}-\d{2}$/
const pageSizes = new Set([10, 30, 50, 100])

export function validatePurchaseStatisticsQuery(input: PurchaseStatisticsQuery): ProcurementValidationIssue[] {
  const issues: ProcurementValidationIssue[] = []
  if (!purchaseStatisticsReports.has(input.report)) issues.push({ path: 'report', message: '采购统计报表无效' })
  for (const key of ['fromDate', 'toDate'] as const) if (input[key] !== undefined && !datePattern.test(input[key]!)) issues.push({ path: key, message: '日期必须为 YYYY-MM-DD' })
  if (input.fromDate && input.toDate && input.fromDate > input.toDate) issues.push({ path: 'fromDate', message: '开始日期不能晚于结束日期' })
  if (input.page !== undefined && (!Number.isSafeInteger(input.page) || input.page < 1)) issues.push({ path: 'page', message: '页码必须为正整数' })
  if (input.pageSize !== undefined && !pageSizes.has(input.pageSize)) issues.push({ path: 'pageSize', message: '分页大小无效' })
  if ((input.keyword?.trim().length ?? 0) > 100) issues.push({ path: 'keyword', message: '商品信息不能超过 100 字' })
  return issues
}

export function normalizePurchaseStatisticsQuery(input: PurchaseStatisticsQuery, now: string): PurchaseStatisticsPageQuery {
  const issues = validatePurchaseStatisticsQuery(input); if (issues.length) throw new ProcurementValidationError(issues)
  const toDate = input.toDate ?? now.slice(0, 10)
  const [year, month, day] = toDate.split('-').map(Number) as [number, number, number]
  const targetMonth = month - 3; const targetYear = targetMonth <= 0 ? year - 1 : year; const normalizedMonth = targetMonth <= 0 ? targetMonth + 12 : targetMonth
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth, 0)).getUTCDate()
  const fromDate = input.fromDate ?? `${targetYear}-${String(normalizedMonth).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`
  const normalized = { ...input, fromDate, toDate, page: input.page ?? 1, pageSize: input.pageSize ?? 30 } as PurchaseStatisticsPageQuery
  const normalizedIssues = validatePurchaseStatisticsQuery(normalized); if (normalizedIssues.length) throw new ProcurementValidationError(normalizedIssues)
  return normalized
}

export type PurchaseStatisticsPageQuery = PurchaseStatisticsQuery & Required<Pick<PurchaseStatisticsQuery, 'fromDate' | 'toDate' | 'page' | 'pageSize'>>
