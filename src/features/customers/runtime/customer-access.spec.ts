import { afterEach, describe, expect, it } from 'vitest'
import { guardCustomerSubroute, setCurrentCustomerRole } from './customer-access'

describe('CUS-001 route permission guard', () => {
  afterEach(() => setCurrentCustomerRole('super-admin'))

  it('keeps the list as denial surface and blocks customer subroutes', () => {
    setCurrentCustomerRole('warehouse')
    expect(guardCustomerSubroute('/customers')).toBe(true)
    expect(guardCustomerSubroute('/customers/new')).toBe('/customers?denied=1')
    expect(guardCustomerSubroute('/customers/customer-1')).toBe('/customers?denied=1')
    setCurrentCustomerRole('salesperson')
    expect(guardCustomerSubroute('/customers/customer-1/edit')).toBe(true)
  })
})
