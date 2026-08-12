import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDistributionStore } from './distribution-store'

describe('PRD-004 distribution runtime scenarios', () => {
  beforeEach(() => { setActivePinia(createPinia()); vi.useFakeTimers() })
  afterEach(() => vi.useRealTimers())

  it('loads source-backed plans, templates, options and unavailable statistics', async () => {
    const store=useDistributionStore(); let request=store.load('plans'); await vi.advanceTimersByTimeAsync(240); await request
    expect(store.plans.total).toBe(2); expect(store.options.customerTags.length).toBeGreaterThan(0)
    request=store.load('templates'); await vi.advanceTimersByTimeAsync(240); await request; expect(store.templates.total).toBe(2)
    request=store.load('statistics'); await vi.advanceTimersByTimeAsync(240); await request; expect(store.statistics?.status).toBe('unavailable')
  })

  it('reproduces empty, error, slow, denied, partial and boundary states', async () => {
    const store=useDistributionStore(); let request=store.setScenario('empty'); await vi.advanceTimersByTimeAsync(160); await request; expect(store.isEmpty).toBe(true)
    request=store.setScenario('error'); await vi.advanceTimersByTimeAsync(240); await request; expect(store.error).toContain('铺货与模板服务暂时不可用')
    request=store.setScenario('slow'); await vi.advanceTimersByTimeAsync(1799); expect(store.loading).toBe(true); await vi.advanceTimersByTimeAsync(1801); await request
    request=store.setScenario('permission-denied'); await vi.advanceTimersByTimeAsync(100); await request; expect(store.error).toContain('不可访问铺货与订单模板配置')
    request=store.setScenario('partial-failure'); await vi.advanceTimersByTimeAsync(240); await request; expect(store.referenceError).toContain('客户资料加载失败'); expect(store.options.customers).toEqual([])
    request=store.setScenario('boundary'); await vi.advanceTimersByTimeAsync(240); await request; expect(store.options.clock).toBe('2026-08-10T10:00:00+08:00')
  })

  it('saves configuration and resolves suggestions through the async boundary', async () => {
    const store=useDistributionStore(); let request=store.load('plans'); await vi.advanceTimersByTimeAsync(240); await request
    const created=store.savePlan({name:'运行时方案',status:'enabled',startsAt:'2026-08-10T11:00:00+08:00',endsAt:'2026-08-11T11:00:00+08:00',scope:{type:'all',provinceCodes:[],cityCodes:[],districtCodes:[],categoryIds:[],tagIds:[],customerIds:[]},lines:[{skuId:'sku-1',quantity:1}]}); await vi.advanceTimersByTimeAsync(120); expect((await created).name).toBe('运行时方案')
    let preview=store.resolveDistribution('customer-1','mobile-self-order'); await vi.advanceTimersByTimeAsync(120); expect((await preview).rejected[0]?.reason).toBe('not-authorized')
    request=store.setScenario('boundary'); await vi.advanceTimersByTimeAsync(240); await request
    preview=store.resolveDistribution('customer-1','mobile-self-order'); await vi.advanceTimersByTimeAsync(120); expect((await preview).accepted).toHaveLength(1)
    const template=store.resolveTemplate('order-template-1','customer-1','mobile-self-order'); await vi.advanceTimersByTimeAsync(120); const result=await template; expect(result.accepted).toHaveLength(1); expect(result.rejected[0]?.reason).toBe('product-not-on-sale')
  })
})
