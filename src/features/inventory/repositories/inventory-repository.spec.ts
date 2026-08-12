import { describe, expect, it } from 'vitest'
import { inventoryBaseline } from '../../../../mock/handlers/inventory-handler'
import { InMemoryInventoryRepository } from './inventory-repository'

describe('inventory repository', () => {
  it('isolates reads and commits valid transactions', () => { const repo = new InMemoryInventoryRepository(inventoryBaseline); const read = repo.read(); read.warehouses[0]!.name = 'mutated'; expect(repo.read().warehouses[0]!.name).not.toBe('mutated'); repo.transact((draft) => { draft.warehouses[0]!.name = '演示更新仓' }); expect(repo.read().warehouses[0]!.name).toBe('演示更新仓') })
  it('does not commit an invalid draft', () => { const repo = new InMemoryInventoryRepository(inventoryBaseline); expect(() => repo.transact((draft) => { draft.balances[0]!.quantityMilli = -1 })).toThrow(); expect(repo.read().balances[0]!.quantityMilli).toBe(5000) })
})
