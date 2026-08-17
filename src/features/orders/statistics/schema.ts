import { OrderValidationError, type OrderValidationIssue } from '../schemas/order-schema'
import type { OrderStatisticsQuery, OrderStatisticsReportKey, StatisticsPivotConfig } from './types'

export const orderStatisticsReports = new Set<OrderStatisticsReportKey>([
  'order-line-detail', 'return-line-detail', 'order-by-product', 'order-by-customer', 'presale-line-detail',
  'presale-by-product', 'movement-line-detail', 'movement-by-product', 'movement-by-customer',
])
const datePattern = /^\d{4}-\d{2}-\d{2}$/
const pageSizes = new Set([10, 30, 50, 100])
const dimensions = new Set(['customer', 'product', 'sku', 'unit'])
const measures = new Set(['document-count', 'quantity', 'amount', 'average-price', 'fulfillment-rate', 'discount-rate'])

export function validateOrderStatisticsQuery(input: OrderStatisticsQuery): OrderValidationIssue[] {
  const issues: OrderValidationIssue[] = []
  if (!orderStatisticsReports.has(input.report)) issues.push({ path: 'report', message: '统计报表无效' })
  for (const key of ['fromDate', 'toDate'] as const) if (input[key] !== undefined && !datePattern.test(input[key]!)) issues.push({ path: key, message: '日期必须为 YYYY-MM-DD' })
  if (input.fromDate && input.toDate && input.fromDate > input.toDate) issues.push({ path: 'fromDate', message: '开始日期不能晚于结束日期' })
  if (input.documentKind !== undefined && !['order', 'return'].includes(input.documentKind)) issues.push({ path: 'documentKind', message: '单据范围无效' })
  if (input.unitMode !== undefined && !['base', 'ordered'].includes(input.unitMode)) issues.push({ path: 'unitMode', message: '单位维度无效' })
  if (input.page !== undefined && (!Number.isSafeInteger(input.page) || input.page < 1)) issues.push({ path: 'page', message: '页码必须为正整数' })
  if (input.pageSize !== undefined && !pageSizes.has(input.pageSize)) issues.push({ path: 'pageSize', message: '分页大小无效' })
  if ((input.keyword?.trim().length ?? 0) > 100) issues.push({ path: 'keyword', message: '搜索内容不能超过100字' })
  return issues
}

export function normalizeOrderStatisticsQuery(input: OrderStatisticsQuery, now: string): OrderStatisticsQuery & Required<Pick<OrderStatisticsQuery, 'documentKind' | 'unitMode' | 'fromDate' | 'toDate' | 'page' | 'pageSize'>> {
  const issues = validateOrderStatisticsQuery(input)
  if (issues.length) throw new OrderValidationError(issues)
  const toDate = input.toDate ?? now.slice(0, 10)
  const [year, month, day] = toDate.split('-').map(Number) as [number, number, number]
  const targetMonth = month - 3
  const targetYear = targetMonth <= 0 ? year - 1 : year
  const normalizedMonth = targetMonth <= 0 ? targetMonth + 12 : targetMonth
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth, 0)).getUTCDate()
  const fromDate = input.fromDate ?? `${targetYear}-${String(normalizedMonth).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`
  const normalized = { ...input, documentKind: input.documentKind ?? 'order', unitMode: input.unitMode ?? 'base', fromDate, toDate, page: input.page ?? 1, pageSize: input.pageSize ?? 30 }
  const normalizedIssues = validateOrderStatisticsQuery(normalized)
  if (normalizedIssues.length) throw new OrderValidationError(normalizedIssues)
  return normalized
}

export function assertStatisticsPivotConfig(value: StatisticsPivotConfig): void {
  const issues: OrderValidationIssue[] = []
  if (!['order-by-product', 'order-by-customer'].includes(value.report)) issues.push({ path: 'report', message: '该报表不支持二维表设置' })
  if (!value.dimensions.length || new Set(value.dimensions).size !== value.dimensions.length || value.dimensions.some((item) => !dimensions.has(item))) issues.push({ path: 'dimensions', message: '至少选择一个且不能重复的既有维度' })
  if (!value.measures.length || new Set(value.measures).size !== value.measures.length || value.measures.some((item) => !measures.has(item))) issues.push({ path: 'measures', message: '至少选择一个且不能重复的既有指标' })
  if (issues.length) throw new OrderValidationError(issues)
}
