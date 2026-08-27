import { describe, expect, it } from 'vitest'
import { createBaselineCustomerRepository } from '../../../../mock/handlers/customer-handler'
import { createCustomerOperationsService } from './customer-operations-service'

function createService() {
  const repository = createBaselineCustomerRepository()
  return { repository, service: createCustomerOperationsService({ repository, now: () => '2026-08-27T10:00:00+08:00', nextId: (kind) => `${kind}-test`, staffNames: { 'staff-demo-1': '演示业务员甲' } }) }
}

describe('CUS-008/CUS-009 channel service', () => {
  it('records fake wecom broadcast and supports local recall without external send', () => {
    const { service, repository } = createService()
    const value = service.saveWecomBroadcast({ role: 'super-admin', actorId: 'admin' }, { title: '测试群发', employeeIds: ['staff-demo-1'], audience: 'all', customerIds: [], content: 'fake', image: null, link: null, sendMode: 'now', scheduledAt: null })
    expect(value.status).toBe('completed')
    service.setWecomBroadcastStatus({ role: 'super-admin', actorId: 'admin' }, value.id, 'recalled')
    const state = repository.read()
    expect(state.channelState?.wecomBroadcasts?.find((item) => item.id === value.id)?.status).toBe('recalled')
  })

  it('does not persist mall passwords and rejects warehouse access', () => {
    const { service, repository } = createService()
    service.saveMallCustomer({ role: 'super-admin', actorId: 'admin' }, { customerId: null, name: '测试商城客户', account: 'test@example.com', phone: '13800000000', channel: 'h5', status: 'active', password: 'secret' })
    expect(JSON.stringify(repository.read())).not.toContain('secret')
    expect(() => service.saveMallSettings({ role: 'warehouse', actorId: 'w' }, { name: 'x', introduction: null, displayMode: 'list', searchEnabled: true, categoryEnabled: true, salesVisible: false, stockVisible: false, reviewVisible: false, cartEnabled: true, favoriteEnabled: true, shareEnabled: true, reviewEnabled: true, serviceEnabled: false, paymentMethods: ['wechat'], minimumPaymentCents: 0, paymentTimeoutMinutes: 30 })).toThrow('不可管理')
  })
})
