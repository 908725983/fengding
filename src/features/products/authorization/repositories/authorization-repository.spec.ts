import { describe, expect, it } from 'vitest'
import { authorizationBaseline } from '../../../../../mock/handlers/authorization-handler'
import { InMemoryAuthorizationRepository } from './authorization-repository'

describe('PRD-003 authorization repository', () => {
  it('commits valid transactions and rolls back invalid state', () => {
    const repository = new InMemoryAuthorizationRepository(authorizationBaseline)
    repository.transact((state) => { state.plans[0].name = '已提交名称' })
    expect(repository.read().plans[0].name).toBe('已提交名称')
    expect(() => repository.transact((state) => { state.rules[0].planId = 'missing-plan' })).toThrow('规则引用的方案不存在')
    expect(repository.read().rules[0].planId).toBe('authorization-plan-1')
  })
})

