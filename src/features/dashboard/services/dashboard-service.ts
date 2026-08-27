export type DashboardRole = 'super-admin' | 'sales-supervisor' | 'warehouse' | 'finance'
export type DashboardScenario = 'normal' | 'empty' | 'error' | 'permission-denied'
export interface DashboardMetric { value: number | null; unit: string; reason: string | null }
export interface DashboardTodo { id: string; label: string; count: number; path: string; roles: DashboardRole[] }
export interface DashboardWarning { id: string; type: string; title: string; detail: string; path: string; handled: boolean; roles: DashboardRole[] }
export interface DashboardNotification { id: string; title: string; detail: string; read: boolean; createdAt: string }
export interface DashboardSnapshot { role: DashboardRole; dateLabel: string; todos: DashboardTodo[]; metrics: Record<string, DashboardMetric>; warnings: DashboardWarning[]; notifications: DashboardNotification[]; unavailable: string[] }

const allRoles: DashboardRole[] = ['super-admin', 'sales-supervisor', 'warehouse', 'finance']
const metric = (value: number | null, unit: string, reason: string | null = null): DashboardMetric => ({ value, unit, reason })

export function getDashboardSnapshot(role: DashboardRole, scenario: DashboardScenario = 'normal'): DashboardSnapshot {
  if (scenario === 'error') throw new Error('首页聚合服务暂时不可用')
  if (scenario === 'permission-denied') throw new Error('当前角色不可访问首页经营数据')
  const isEmpty = scenario === 'empty'
  const todos: DashboardTodo[] = isEmpty ? [] : [
    { id: 'pending-review', label: '待审核订单', count: 3, path: '/orders?status=pending-review', roles: ['super-admin', 'sales-supervisor'] as DashboardRole[] },
    { id: 'pending-finance', label: '待财务审核', count: 1, path: '/orders?status=pending-finance-review', roles: ['super-admin', 'sales-supervisor', 'finance'] as DashboardRole[] },
    { id: 'pending-picking', label: '待出库订单', count: 2, path: '/inventory/pending-outbound', roles: ['super-admin', 'warehouse'] as DashboardRole[] },
    { id: 'pending-shipping', label: '待发货订单', count: 2, path: '/inventory/pending-outbound', roles: ['super-admin', 'warehouse'] as DashboardRole[] },
    { id: 'pending-receipt', label: '待签收订单', count: 4, path: '/orders?status=shipped', roles: allRoles },
    { id: 'pending-refund', label: '待处理退款', count: 1, path: '/orders/returns', roles: ['super-admin', 'finance'] as DashboardRole[] },
  ].filter((item) => item.roles.includes(role))
  const warnings: DashboardWarning[] = isEmpty ? [] : [
    { id: 'stock-low-1', type: '库存', title: '库存不足：演示商品 A', detail: '可用库存低于预警值', path: '/inventory/stocks', handled: false, roles: ['super-admin', 'warehouse'] as DashboardRole[] },
    { id: 'customer-risk-1', type: '客户', title: '客户信用额度风险', detail: '需要查看客户资料', path: '/customers', handled: false, roles: ['super-admin', 'sales-supervisor'] as DashboardRole[] },
  ].filter((item) => item.roles.includes(role))
  return {
    role,
    dateLabel: '2026-08-27（Asia/Shanghai）',
    todos,
    metrics: {
      todayOrders: metric(isEmpty ? 0 : role === 'warehouse' ? null : 12, '单', role === 'warehouse' ? '订单统计 provider 未接入' : null),
      todaySalesCents: metric(null, '元', '订单金额 provider 未接入'),
      todayReceiptsCents: metric(role === 'finance' || role === 'super-admin' ? 186000 : null, '元', role === 'finance' || role === 'super-admin' ? null : '资金敏感字段不可见'),
      receivableCents: metric(null, '元', 'Finance provider 未接入'),
    },
    warnings,
    notifications: isEmpty ? [] : [{ id: 'notice-1', title: '原型环境已就绪', detail: '当前数据均为 Mock 或 provider 结果。', read: false, createdAt: '2026-08-27 10:00' }],
    unavailable: ['销售额趋势同比/环比', '订单金额 provider', '复杂预警阈值'],
  }
}
