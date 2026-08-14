import { describe, expect, it } from 'vitest'
import { financeBaseline } from '../../../../mock/handlers/finance-handler'
import { InMemoryFinanceRepository } from './finance-repository'

describe('finance repository', () => {
  it('isolates reads and commits a valid transaction', () => {
    const repository = new InMemoryFinanceRepository(financeBaseline)
    const read = repository.read(); read.accounts[0]!.name = '外部篡改'
    expect(repository.read().accounts[0]!.name).not.toBe('外部篡改')
    repository.transact((draft) => { draft.accounts[0]!.name = '备用金'; draft.accounts[0]!.updatedAt = '2026-08-10T09:01:00+08:00'; draft.accounts[0]!.version += 1 })
    expect(repository.read().accounts[0]!.name).toBe('备用金')
  })

  it('rolls back a transaction when an invariant fails', () => {
    const repository = new InMemoryFinanceRepository(financeBaseline)
    expect(() => repository.transact((draft) => { draft.movements[0]!.balanceAfterCents += 1 })).toThrow()
    expect(repository.read().movements[0]).toEqual(financeBaseline.movements[0])
  })
})
