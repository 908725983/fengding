import { describe, expect, it } from 'vitest'
import { guardProcurementSubroute, setCurrentProcurementRole } from './procurement-access'

describe('procurement access', () => {
  it('allows admin and warehouse while rejecting all other roles', () => {
    for (const role of ['super-admin', 'warehouse'] as const) { setCurrentProcurementRole(role); expect(guardProcurementSubroute('/procurement/suppliers')).toBe(true) }
    for (const role of ['sales-supervisor', 'salesperson', 'finance'] as const) { setCurrentProcurementRole(role); expect(guardProcurementSubroute('/procurement/suppliers')).toBe('/dashboard?denied=procurement') }
    setCurrentProcurementRole('super-admin'); expect(guardProcurementSubroute('/orders')).toBe(true)
  })
})
