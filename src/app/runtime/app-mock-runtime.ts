import { getActivePinia, type Pinia } from 'pinia'
import { shallowRef, type ShallowRef } from 'vue'
import {
  createApplicationMockRuntime,
  type ApplicationMockRuntime,
  type ApplicationMockScenarioName,
} from '../../../mock/runtime/application-mock-runtime'
import {
  exportApplicationData,
  importApplicationData,
} from '../../../mock/runtime/application-browser-persistence'

export interface ApplicationMockRuntimeController {
  runtime: ShallowRef<ApplicationMockRuntime>
  customer: ApplicationMockRuntime['customer']
  product: ApplicationMockRuntime['product']
  order: ApplicationMockRuntime['order']
  inventory: ApplicationMockRuntime['inventory']
  procurement: ApplicationMockRuntime['procurement']
  finance: ApplicationMockRuntime['finance']
  settings: ApplicationMockRuntime['settings']
  authorization: ApplicationMockRuntime['authorization']
  exportData(): string
  importData(input: string): ApplicationMockRuntime
  reset(scenario?: ApplicationMockScenarioName): ApplicationMockRuntime
}

const controllers = new WeakMap<Pinia, ApplicationMockRuntimeController>()

export function getApplicationMockRuntimeController(pinia: Pinia | undefined = getActivePinia()): ApplicationMockRuntimeController {
  if (!pinia) throw new Error('应用 Mock Runtime 必须在 Pinia 初始化后创建')
  const existing = controllers.get(pinia)
  if (existing) return existing

  const runtime = shallowRef(createApplicationMockRuntime())
  const proxy = <K extends 'customer' | 'product' | 'order' | 'inventory' | 'procurement' | 'finance' | 'settings' | 'authorization'>(domain: K): ApplicationMockRuntime[K] => new Proxy({} as ApplicationMockRuntime[K], {
    get: (_target, property) => Reflect.get(runtime.value[domain], property),
  })
  const controller: ApplicationMockRuntimeController = {
    runtime,
    customer: proxy('customer'),
    product: proxy('product'),
    order: proxy('order'),
    inventory: proxy('inventory'),
    procurement: proxy('procurement'),
    finance: proxy('finance'),
    settings: proxy('settings'),
    authorization: proxy('authorization'),
    exportData() {
      return exportApplicationData(runtime.value)
    },
    importData(input: string) {
      importApplicationData(runtime.value, input)
      runtime.value = createApplicationMockRuntime()
      return runtime.value
    },
    reset(scenario = 'normal') {
      runtime.value = createApplicationMockRuntime(scenario)
      return runtime.value
    },
  }
  controllers.set(pinia, controller)
  return controller
}
