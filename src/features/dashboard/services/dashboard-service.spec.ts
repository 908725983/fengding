import { describe, expect, it } from 'vitest'
import { getDashboardSnapshot } from './dashboard-service'

describe('dashboard service', () => {
  it('filters todos by role and keeps unavailable provider values explicit', () => {
    const warehouse = getDashboardSnapshot('warehouse')
    expect(warehouse.todos.every((item) => item.roles.includes('warehouse'))).toBe(true)
    expect(warehouse.metrics.todaySalesCents.value).toBeNull()
    expect(warehouse.metrics.todaySalesCents.reason).toContain('订单金额')
  })

  it('distinguishes empty, error and permission-denied scenarios', () => {
    expect(getDashboardSnapshot('super-admin', 'empty').todos).toHaveLength(0)
    expect(() => getDashboardSnapshot('super-admin', 'error')).toThrow('聚合服务')
    expect(() => getDashboardSnapshot('finance', 'permission-denied')).toThrow('不可访问')
  })
})
