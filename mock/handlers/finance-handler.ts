import baseline from '../fixtures/baseline.json'
import emptyScenario from '../scenarios/empty.json'
import errorScenario from '../scenarios/error.json'
import normalScenario from '../scenarios/normal.json'
import permissionScenario from '../scenarios/permission-denied.json'
import slowScenario from '../scenarios/slow.json'
import { InMemoryFinanceRepository } from '../../src/features/finance/repositories/finance-repository'
import { FinanceDomainError, createFinanceService } from '../../src/features/finance/services/finance-service'
import type { FinanceFeatureState } from '../../src/features/finance/types'

const featureData = baseline.featureData as Record<string, unknown>
export const financeBaseline = structuredClone(featureData['FIN-003']) as FinanceFeatureState
export function createBaselineFinanceRepository(): InMemoryFinanceRepository { return new InMemoryFinanceRepository(financeBaseline) }

export type FinanceScenarioName = 'normal' | 'empty' | 'error' | 'slow' | 'permission-denied' | 'partial-failure' | 'boundary' | 'concurrent'
const scenarios = { normal: normalScenario, empty: emptyScenario, error: errorScenario, slow: slowScenario, 'permission-denied': permissionScenario, 'partial-failure': normalScenario, boundary: normalScenario, concurrent: normalScenario } as const

export class FinanceMockError extends Error { constructor(readonly code: string, message: string) { super(message); this.name = 'FinanceMockError' } }

export function createFinanceMockSession(scenarioName: FinanceScenarioName = 'normal') {
  const state = structuredClone(financeBaseline)
  if (scenarioName === 'empty') { state.accounts = []; state.movements = []; state.periods = []; state.banks = []; state.paymentChannels = []; state.paymentApplications = []; state.requests = []; state.auditLogs = [] }
  const repository = new InMemoryFinanceRepository(state); let sequence = 1
  const unavailable = () => { throw new FinanceDomainError('DATA_PROVIDER_UNAVAILABLE', '原型模拟：第三方资料服务暂时不可用') }
  const service = createFinanceService({ repository, now: () => baseline.clock, nextId: (kind) => `${kind}-runtime-${sequence++}`, actorName: () => '演示操作员', assertBankProvider: scenarioName === 'partial-failure' ? unavailable : undefined, assertPaymentProvider: scenarioName === 'partial-failure' ? unavailable : undefined })
  const definition = scenarios[scenarioName]
  async function run<T>(operation: () => T): Promise<T> { await new Promise((resolve) => setTimeout(resolve, definition.latencyMs)); if (scenarioName === 'error') throw new FinanceMockError('MOCK_INTERNAL_ERROR', '原型模拟：资金服务暂时不可用'); return operation() }
  return { scenarioName, repository, service, run }
}
