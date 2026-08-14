import { beforeEach, describe, expect, it } from 'vitest'
import { guardFinanceSubroute, setCurrentFinanceRole } from './finance-access'

describe('finance route access', () => {
  beforeEach(() => setCurrentFinanceRole('super-admin'))
  it('allows account readers and rejects roles without finance access', () => { setCurrentFinanceRole('sales-supervisor'); expect(guardFinanceSubroute('/finance/accounts')).toBe(true); setCurrentFinanceRole('warehouse'); expect(guardFinanceSubroute('/finance/accounts')).toBe('/dashboard?denied=finance') })
  it('keeps management pages unavailable to a read-only supervisor', () => { setCurrentFinanceRole('sales-supervisor'); expect(guardFinanceSubroute('/finance/carryovers')).toContain('denied=1'); expect(guardFinanceSubroute('/finance/receipts/new')).toContain('denied=1'); expect(guardFinanceSubroute('/finance/writeoffs/new')).toContain('denied=1'); expect(guardFinanceSubroute('/finance/receivables')).toBe(true); expect(guardFinanceSubroute('/finance/accounts/account-cash')).toBe(true) })
})
