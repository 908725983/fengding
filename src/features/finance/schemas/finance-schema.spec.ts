import { describe, expect, it } from 'vitest'
import { financeBaseline } from '../../../../mock/handlers/finance-handler'
import { assertFinanceFeatureState, FinanceValidationError, validateFinanceAccountDraft, validateFinanceBankDraft } from './finance-schema'

describe('finance schema', () => {
  it('accepts the deterministic FIN-003 baseline', () => { expect(() => assertFinanceFeatureState(financeBaseline)).not.toThrow() })
  it('validates account money, month and bank account boundaries', () => {
    expect(validateFinanceAccountDraft({ name: '', type: 'cash', status: 'enabled', openingMonth: '2026-13', openingBalanceCents: -1 })).toHaveLength(3)
    expect(validateFinanceBankDraft({ accountId: 'x', bankName: '演示银行', accountName: '演示户名', bankAccount: '12', branchName: '演示支行', accountKind: 'corporate', status: 'enabled' }).some((item) => item.path === 'bankAccount')).toBe(true)
  })
  it('rejects a ledger balance that does not reconcile', () => {
    const state = structuredClone(financeBaseline); state.movements[0]!.balanceAfterCents += 1
    expect(() => assertFinanceFeatureState(state)).toThrow(FinanceValidationError)
  })
})
