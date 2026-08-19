import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useProcurementStore } from './procurement-store'

describe('procurement store', () => {
  beforeEach(() => setActivePinia(createPinia()))
  it('loads normal, empty and partial failure states distinctly', async () => {
    const store = useProcurementStore(); await store.load(); expect(store.workspace.suppliers.total).toBe(3)
    await store.setScenario('empty'); expect(store.isEmpty).toBe(true); expect(store.workspace.directDelivery.availability).toBe('unavailable')
    await store.setScenario('partial-failure'); expect(store.workspace.suppliers.total).toBe(3); expect(store.workspace.catalogAvailable).toBe(false)
  })
  it('loads permission denial without leaking workspace rows', async () => {
    const store = useProcurementStore(); await store.setScenario('permission-denied'); expect(store.error).toContain('无权访问'); expect(store.workspace.suppliers.items).toEqual([])
  })
})
