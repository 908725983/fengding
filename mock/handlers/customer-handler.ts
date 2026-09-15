import baseline from '../fixtures/baseline.json'
import emptyScenario from '../scenarios/empty.json'
import errorScenario from '../scenarios/error.json'
import normalScenario from '../scenarios/normal.json'
import permissionScenario from '../scenarios/permission-denied.json'
import slowScenario from '../scenarios/slow.json'
import type { CustomerFeatureState } from '../../src/features/customers/types'
import { InMemoryCustomerRepository } from '../../src/features/customers/repositories/customer-repository'
import { createCustomerService } from '../../src/features/customers/services/customer-service'
import { createCustomerOperationsService } from '../../src/features/customers/services/customer-operations-service'
import { createRuntimeSequence } from '../runtime/application-browser-persistence'

const featureData = baseline.featureData as Record<string, unknown>

export const customerBaseline = structuredClone(featureData['CUS-001']) as CustomerFeatureState

export function createBaselineCustomerRepository(): InMemoryCustomerRepository {
  return new InMemoryCustomerRepository(customerBaseline)
}

export type CustomerScenarioName = 'normal' | 'empty' | 'error' | 'slow' | 'permission-denied' | 'partial-failure'

const scenarioDefinitions = {
  normal: normalScenario,
  empty: emptyScenario,
  error: errorScenario,
  slow: slowScenario,
  'permission-denied': permissionScenario,
  'partial-failure': normalScenario,
} as const

export class CustomerMockError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
    this.name = 'CustomerMockError'
  }
}

export function createCustomerMockSession(scenarioName: CustomerScenarioName = 'normal') {
  const state = structuredClone(customerBaseline)
  if (scenarioName === 'empty') {
    state.customers = []
    state.suggestions = []
    state.changeLogs = []
    state.membershipLevels = []
    state.memberships = []
    state.pointAccounts = []
    state.pointLedger = []
    state.coupons = []
    state.couponInstances = []
    state.promotions = []
    state.voucherCampaigns = []
    state.voucherIssues = []
    state.marketingArticles = []
    state.channelState = { wecomSyncRecords: [], wecomBroadcasts: [], wecomTagMappings: [], wecomScripts: [], wecomWelcomeMessages: [], wecomGroups: [], wecomMoments: [], mallCustomers: [], mallEmployees: [], mallDesigns: [], mallExtensions: [], mallAds: [], mallPopups: [], mallMessages: [] }
  }
  const repository = new InMemoryCustomerRepository(state)
  const nextSequence = createRuntimeSequence()
  const service = createCustomerService({
    repository,
    now: () => baseline.clock,
    nextId: (kind) => `${kind}-runtime-${nextSequence()}`,
    staffNames: { 'staff-demo-1': '演示业务员甲', 'staff-demo-2': '演示业务员乙' },
  })
  const operations = createCustomerOperationsService({
    repository,
    now: () => baseline.clock,
    nextId: (kind) => `${kind}-runtime-${nextSequence()}`,
    staffNames: { 'staff-demo-1': '演示业务员甲', 'staff-demo-2': '演示业务员乙' },
  })
  const definition = scenarioDefinitions[scenarioName]

  async function run<T>(operation: () => T): Promise<T> {
    await new Promise((resolve) => setTimeout(resolve, definition.latencyMs))
    if (scenarioName === 'error') throw new CustomerMockError('MOCK_INTERNAL_ERROR', '原型模拟：服务暂时不可用')
    return operation()
  }

  return { scenarioName, repository, service, operations, run }
}
