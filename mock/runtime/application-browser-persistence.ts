import type { CustomerFeatureState } from '../../src/features/customers/types'
import { assertCustomerFeatureState } from '../../src/features/customers/schemas/customer-schema'
import type { FinanceFeatureState } from '../../src/features/finance/types'
import { assertFinanceFeatureState } from '../../src/features/finance/schemas/finance-schema'
import type { InventoryFeatureState } from '../../src/features/inventory/types'
import { assertInventoryFeatureState } from '../../src/features/inventory/schemas/inventory-schema'
import type { OrderFeatureState } from '../../src/features/orders/types'
import { assertOrderFeatureState } from '../../src/features/orders/schemas/order-schema'
import type { ProcurementFeatureState } from '../../src/features/procurement/types'
import { assertProcurementFeatureState } from '../../src/features/procurement/schemas/procurement-schema'
import type { AuthorizationFeatureState } from '../../src/features/products/authorization/types'
import { assertAuthorizationFeatureState } from '../../src/features/products/authorization/schemas/authorization-schema'
import type { ProductFeatureState } from '../../src/features/products/types'
import { assertProductFeatureState } from '../../src/features/products/schemas/product-schema'
import type { SettingsFeatureState } from '../../src/features/settings/types'
import { assertSettingsFeatureState } from '../../src/features/settings/schemas/settings-schema'

interface StateRepository<T> {
  read(): T
  transact<R>(mutation: (draft: T) => R): R
  reset(state: T): void
}

export interface ApplicationRuntimeStateOwner {
  customer: { repository: StateRepository<CustomerFeatureState> }
  product: { repository: StateRepository<ProductFeatureState> }
  order: { repository: StateRepository<OrderFeatureState> }
  inventory: { repository: StateRepository<InventoryFeatureState> }
  procurement: { repository: StateRepository<ProcurementFeatureState> }
  finance: { repository: StateRepository<FinanceFeatureState> }
  settings: { repository: StateRepository<SettingsFeatureState> }
  authorization: { repository: StateRepository<AuthorizationFeatureState> }
}

export interface ApplicationDataPackage {
  schemaVersion: 1
  product: 'fengding-prototype'
  exportedAt: string
  domains: {
    customer: CustomerFeatureState
    product: ProductFeatureState
    order: OrderFeatureState
    inventory: InventoryFeatureState
    procurement: ProcurementFeatureState
    finance: FinanceFeatureState
    settings: SettingsFeatureState
    authorization: AuthorizationFeatureState
  }
}

export const applicationBrowserStateKey = 'fengding:mock:application-state:v1'

interface PersistenceController {
  replace(snapshot: ApplicationDataPackage): void
}

const persistenceControllers = new WeakMap<object, PersistenceController>()

function requiresBrowserPersistence(): boolean {
  return typeof window !== 'undefined' && !/jsdom/i.test(window.navigator.userAgent)
}

function browserStorage(): Storage | null {
  if (!requiresBrowserPersistence()) return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function createRuntimeSequence(): () => string {
  let sequence = 1
  const storage = browserStorage()
  const namespace = storage
    ? (typeof window.crypto?.randomUUID === 'function'
        ? window.crypto.randomUUID().slice(0, 8)
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`)
    : null
  return () => namespace ? `${namespace}-${sequence++}` : String(sequence++)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validateDomains(domains: ApplicationDataPackage['domains']): void {
  assertCustomerFeatureState(domains.customer)
  assertProductFeatureState(domains.product)
  assertOrderFeatureState(domains.order)
  assertInventoryFeatureState(domains.inventory)
  assertProcurementFeatureState(domains.procurement)
  assertFinanceFeatureState(domains.finance)
  assertSettingsFeatureState(domains.settings)
  assertAuthorizationFeatureState(domains.authorization)
}

export function parseApplicationDataPackage(input: string | unknown): ApplicationDataPackage {
  let value: unknown
  try {
    value = typeof input === 'string' ? JSON.parse(input) : input
  } catch {
    throw new Error('数据包不是有效的 JSON 文件')
  }
  if (!isRecord(value) || value.schemaVersion !== 1 || value.product !== 'fengding-prototype' || !isRecord(value.domains)) {
    throw new Error('请选择由蜂订原型导出的数据包')
  }
  if (typeof value.exportedAt !== 'string' || !value.exportedAt.trim()) throw new Error('数据包缺少导出时间')
  const domains = value.domains as unknown as ApplicationDataPackage['domains']
  try {
    validateDomains(domains)
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : '数据结构不完整'
    throw new Error(`数据包校验失败：${message}`)
  }
  return structuredClone({
    schemaVersion: 1,
    product: 'fengding-prototype',
    exportedAt: value.exportedAt,
    domains,
  })
}

export function createApplicationDataPackage(runtime: ApplicationRuntimeStateOwner): ApplicationDataPackage {
  return {
    schemaVersion: 1,
    product: 'fengding-prototype',
    exportedAt: new Date().toISOString(),
    domains: {
      customer: runtime.customer.repository.read(),
      product: runtime.product.repository.read(),
      order: runtime.order.repository.read(),
      inventory: runtime.inventory.repository.read(),
      procurement: runtime.procurement.repository.read(),
      finance: runtime.finance.repository.read(),
      settings: runtime.settings.repository.read(),
      authorization: runtime.authorization.repository.read(),
    },
  }
}

function applySnapshot(runtime: ApplicationRuntimeStateOwner, snapshot: ApplicationDataPackage): void {
  runtime.customer.repository.reset(snapshot.domains.customer)
  runtime.product.repository.reset(snapshot.domains.product)
  runtime.order.repository.reset(snapshot.domains.order)
  runtime.inventory.repository.reset(snapshot.domains.inventory)
  runtime.procurement.repository.reset(snapshot.domains.procurement)
  runtime.finance.repository.reset(snapshot.domains.finance)
  runtime.settings.repository.reset(snapshot.domains.settings)
  runtime.authorization.repository.reset(snapshot.domains.authorization)
}

function patchRepository<T>(repository: StateRepository<T>, afterWrite: () => void): void {
  const originalTransact = repository.transact.bind(repository)
  const originalReset = repository.reset.bind(repository)
  repository.transact = <R>(mutation: (draft: T) => R): R => {
    const result = originalTransact(mutation)
    afterWrite()
    return result
  }
  repository.reset = (state: T): void => {
    originalReset(state)
    afterWrite()
  }
}

export function attachApplicationBrowserPersistence(runtime: ApplicationRuntimeStateOwner): void {
  const storage = browserStorage()
  if (!storage || persistenceControllers.has(runtime)) return

  let suppressPersistence = true
  const persist = (strict = false): void => {
    if (suppressPersistence) return
    try {
      storage.setItem(applicationBrowserStateKey, JSON.stringify(createApplicationDataPackage(runtime)))
    } catch (caught) {
      if (strict) throw new Error('浏览器存储空间不足，数据导入未保存', { cause: caught })
    }
  }

  const raw = storage.getItem(applicationBrowserStateKey)
  if (raw) {
    try {
      applySnapshot(runtime, parseApplicationDataPackage(raw))
    } catch {
      // Keep the validated runtime fallback when an old or incomplete browser snapshot cannot be read.
    }
  }

  const afterWrite = (): void => persist()
  patchRepository(runtime.customer.repository, afterWrite)
  patchRepository(runtime.product.repository, afterWrite)
  patchRepository(runtime.order.repository, afterWrite)
  patchRepository(runtime.inventory.repository, afterWrite)
  patchRepository(runtime.procurement.repository, afterWrite)
  patchRepository(runtime.finance.repository, afterWrite)
  patchRepository(runtime.settings.repository, afterWrite)
  patchRepository(runtime.authorization.repository, afterWrite)

  suppressPersistence = false
  persist()
  persistenceControllers.set(runtime, {
    replace(snapshot) {
      const previous = createApplicationDataPackage(runtime)
      suppressPersistence = true
      try {
        applySnapshot(runtime, snapshot)
        storage.setItem(applicationBrowserStateKey, JSON.stringify(snapshot))
      } catch (caught) {
        applySnapshot(runtime, previous)
        try { storage.setItem(applicationBrowserStateKey, JSON.stringify(previous)) } catch { /* previous in-memory state is still restored */ }
        throw caught
      } finally {
        suppressPersistence = false
      }
    },
  })
}

export function exportApplicationData(runtime: ApplicationRuntimeStateOwner): string {
  return JSON.stringify(createApplicationDataPackage(runtime), null, 2)
}

export function importApplicationData(runtime: ApplicationRuntimeStateOwner, input: string | unknown): void {
  const snapshot = parseApplicationDataPackage(input)
  const controller = persistenceControllers.get(runtime)
  if (controller) controller.replace(snapshot)
  else if (requiresBrowserPersistence()) {
    throw new Error('当前浏览器无法使用本地存储，数据导入未执行。请允许此站点使用浏览器存储后重试')
  } else applySnapshot(runtime, snapshot)
}
