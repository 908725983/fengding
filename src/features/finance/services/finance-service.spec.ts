import { describe, expect, it } from 'vitest'
import { createFinanceMockSession, financeBaseline } from '../../../../mock/handlers/finance-handler'
import { InMemoryFinanceRepository } from '../repositories/finance-repository'
import type { FinanceActor } from '../types'
import { createFinanceService, FinanceDomainError } from './finance-service'

const admin: FinanceActor = { actorId: 'admin-demo', role: 'super-admin' }
const finance: FinanceActor = { actorId: 'finance-demo', role: 'finance' }
const supervisor: FinanceActor = { actorId: 'supervisor-demo', role: 'sales-supervisor' }
const salesperson: FinanceActor = { actorId: 'sales-demo', role: 'salesperson' }

function setup() {
  const repository = new InMemoryFinanceRepository(financeBaseline); let sequence = 1
  const service = createFinanceService({ repository, now: () => '2026-08-10T09:00:00+08:00', nextId: (kind) => `${kind}-test-${sequence++}`, actorName: (actor) => `姓名-${actor.actorId}` })
  return { repository, service }
}

describe('finance service', () => {
  it('calculates a selected month and returns frozen closed-period totals', () => {
    const { service } = setup()
    const july = service.listAccounts(supervisor, '2026-07').find((item) => item.account.id === 'account-cash')!
    const august = service.listAccounts(supervisor, '2026-08').find((item) => item.account.id === 'account-cash')!
    expect(july).toMatchObject({ openingBalanceCents: 100000, periodIncomeCents: 50000, periodExpenseCents: 20000, closingBalanceCents: 130000 })
    expect(august).toMatchObject({ openingBalanceCents: 130000, periodIncomeCents: 10000, periodExpenseCents: 5000, closingBalanceCents: 135000 })
  })

  it('lists account movements in stable chronological order', () => {
    const { service } = setup(); const detail = service.getAccountDetail(finance, 'account-cash', '2026-08')
    expect(detail.movements.map((item) => item.id)).toEqual(['finance-movement-007', 'finance-movement-008'])
  })

  it('enforces finance permissions and masks a bank account for read-only sales supervisors', () => {
    const { service } = setup()
    expect(() => service.listAccounts(salesperson)).toThrowError(FinanceDomainError)
    expect(service.getAccountDetail(supervisor, 'account-bank').bank?.bankAccount).toBe('•••• 1234')
    expect(service.getAccountDetail(finance, 'account-bank').bank?.bankAccount).toBe('6222000000001234')
    expect(() => service.listBanks(supervisor)).toThrowError(FinanceDomainError)
  })

  it('creates an account idempotently and rejects duplicate names', () => {
    const { service } = setup()
    const input = { requestId: 'request-account-1', draft: { name: '备用现金', type: 'cash' as const, status: 'enabled' as const, openingMonth: '2026-08', openingBalanceCents: 0 } }
    const first = service.saveAccount(admin, input); const replay = service.saveAccount(admin, input)
    expect(replay.id).toBe(first.id)
    expect(() => service.saveAccount(admin, { ...input, requestId: 'request-account-2' })).toThrowError(FinanceDomainError)
  })

  it('locks opening data after a movement or period snapshot and checks optimistic updates', () => {
    const { service } = setup(); const cash = financeBaseline.accounts.find((item) => item.id === 'account-cash')!
    expect(() => service.saveAccount(finance, { requestId: 'request-edit-cash', accountId: cash.id, expectedUpdatedAt: cash.updatedAt, draft: { name: cash.name, type: cash.type, status: cash.status, openingMonth: cash.openingMonth, openingBalanceCents: cash.openingBalanceCents + 1 } })).toThrowError(FinanceDomainError)
    expect(() => service.saveAccount(finance, { requestId: 'request-stale', accountId: cash.id, expectedUpdatedAt: '2026-01-01T00:00:00+08:00', draft: { name: cash.name, type: cash.type, status: 'disabled', openingMonth: cash.openingMonth, openingBalanceCents: cash.openingBalanceCents } })).toThrowError(FinanceDomainError)
  })

  it('posts immutable chronological movements idempotently and forbids a negative balance', () => {
    const { service } = setup()
    const input = { requestId: 'request-movement-1', accountId: 'account-cash', direction: 'expense' as const, kind: 'prototype' as const, amountCents: 5000, sourceId: 'source-test', sourceNo: 'TEST-001', summary: '测试支出', occurredAt: '2026-08-10T08:00:00+08:00' }
    const first = service.postMovement(finance, input); const replay = service.postMovement(finance, input)
    expect(first.balanceAfterCents).toBe(130000); expect(replay.id).toBe(first.id)
    expect(() => service.postMovement(finance, { ...input, requestId: 'request-movement-2', amountCents: 9999999 })).toThrowError(FinanceDomainError)
  })

  it('rejects movements for disabled accounts and locked periods', () => {
    const { service } = setup()
    const base = { requestId: 'request-disabled', direction: 'income' as const, kind: 'prototype' as const, amountCents: 1, sourceId: 'source-test', sourceNo: 'TEST-002', summary: '测试', occurredAt: '2026-08-10T08:00:00+08:00' }
    expect(() => service.postMovement(finance, { ...base, accountId: 'account-alipay' })).toThrowError(FinanceDomainError)
    expect(() => service.postMovement(finance, { ...base, requestId: 'request-locked', accountId: 'account-cash', occurredAt: '2026-07-30T08:00:00+08:00' })).toThrowError(FinanceDomainError)
  })

  it('closes only the next month atomically and protects concurrent requests', () => {
    const { service, repository } = setup(); const version = repository.read().version
    expect(() => service.closePeriod(finance, { requestId: 'request-close-gap', month: '2026-09', expectedStateVersion: version })).toThrowError(FinanceDomainError)
    const closed = service.closePeriod(finance, { requestId: 'request-close-aug', month: '2026-08', expectedStateVersion: version })
    expect(closed.snapshots.find((item) => item.accountId === 'account-bank')?.closingBalanceCents).toBe(565000)
    expect(service.closePeriod(finance, { requestId: 'request-close-aug', month: '2026-08', expectedStateVersion: version }).id).toBe(closed.id)
    expect(() => service.closePeriod(finance, { requestId: 'request-close-stale', month: '2026-08', expectedStateVersion: version })).toThrowError(FinanceDomainError)
  })

  it('reverses only the latest closed month with a reason and audit record', () => {
    const { service, repository } = setup(); service.closePeriod(finance, { requestId: 'request-close', month: '2026-08', expectedStateVersion: repository.read().version })
    const reversed = service.reversePeriod(finance, { requestId: 'request-reverse', month: '2026-08', reason: '复核发现演示数据需要调整', expectedStateVersion: repository.read().version })
    expect(reversed.status).toBe('reversed'); expect(reversed.reversalReason).toBe('复核发现演示数据需要调整')
    expect(repository.read().auditLogs.at(-1)?.action).toBe('period.reversed')
  })

  it('blocks reversing a period when later movements exist', () => {
    const { service, repository } = setup()
    expect(() => service.reversePeriod(finance, { requestId: 'request-reverse-july', month: '2026-07', reason: '测试阻断', expectedStateVersion: repository.read().version })).toThrowError(FinanceDomainError)
  })

  it('maintains one bank profile per bank account and normalizes the account number', () => {
    const { service } = setup()
    const account = service.saveAccount(admin, { requestId: 'request-bank-account', draft: { name: '演示银行二户', type: 'bank', status: 'enabled', openingMonth: '2026-08', openingBalanceCents: 0 } })
    const bank = service.saveBank(finance, { requestId: 'request-bank-profile', draft: { accountId: account.id, bankName: '演示银行', accountName: '演示企业', bankAccount: ' 1234 5678 ', branchName: '演示二支行', accountKind: 'corporate', status: 'enabled' } })
    expect(bank.bankAccount).toBe('12345678')
    expect(() => service.saveBank(finance, { requestId: 'request-bank-duplicate', draft: { ...bank, accountId: 'account-bank' } })).toThrowError(FinanceDomainError)
  })

  it('creates only a clearly simulated payment application and keeps the channel unopened', () => {
    const { service } = setup(); const channel = service.listPaymentChannels(finance)[0]!
    const application = service.submitPaymentApplication(finance, { requestId: 'request-payment', channelId: channel.id })
    expect(application.status).toBe('simulated-pending')
    expect(service.listPaymentChannels(finance)[0]).toMatchObject({ status: 'unopened', application: { status: 'simulated-pending' } })
  })

  it('keeps partial provider failures explicit instead of returning fictional empty data', () => {
    const session = createFinanceMockSession('partial-failure')
    expect(() => session.service.listBanks(finance)).toThrowError(FinanceDomainError)
    expect(session.service.listAccounts(finance)).toHaveLength(4)
  })
})
