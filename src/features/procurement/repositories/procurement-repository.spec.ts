import { describe, expect, it } from 'vitest'
import { procurementBaseline } from '../../../../mock/handlers/procurement-handler'
import { InMemoryProcurementRepository } from './procurement-repository'

describe('procurement repository', () => {
  it('clones reads and rolls back invalid transactions', () => {
    const repository = new InMemoryProcurementRepository(procurementBaseline)
    repository.read().suppliers[0].name = '外部修改'
    expect(repository.read().suppliers[0].name).toBe('演示华北食品供应商')
    expect(() => repository.transact((state) => { state.suppliers[1].code = state.suppliers[0].code })).toThrow()
    expect(repository.read().suppliers[1].code).toBe('SUP-000002')
  })
})
