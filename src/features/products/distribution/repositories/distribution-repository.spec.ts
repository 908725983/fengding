import { describe, expect, it } from 'vitest'
import { distributionBaseline } from '../../../../../mock/handlers/distribution-handler'
import { InMemoryDistributionRepository } from './distribution-repository'

describe('PRD-004 distribution repository', () => {
  it('isolates reads and rolls back invalid mutations', () => {
    const repository = new InMemoryDistributionRepository(distributionBaseline)
    const read = repository.read(); read.plans[0]!.name = '外部修改'; expect(repository.read().plans[0]!.name).not.toBe('外部修改')
    expect(() => repository.transact((state) => { state.plans[0]!.lines = [] })).toThrow()
    expect(repository.read()).toEqual(distributionBaseline)
  })
})
