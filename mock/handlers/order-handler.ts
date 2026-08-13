import baseline from '../fixtures/baseline.json'
import emptyScenario from '../scenarios/empty.json'
import errorScenario from '../scenarios/error.json'
import normalScenario from '../scenarios/normal.json'
import permissionScenario from '../scenarios/permission-denied.json'
import slowScenario from '../scenarios/slow.json'
import type { CustomerFeatureState } from '../../src/features/customers/types'
import type { OrderCustomerProvider, OrderFeatureState, OrderFinanceProvider } from '../../src/features/orders/types'
import { InMemoryOrderRepository } from '../../src/features/orders/repositories/order-repository'
import { createOrderService } from '../../src/features/orders/services/order-service'

const featureData=baseline.featureData as Record<string,unknown>
export const orderBaseline=structuredClone(featureData['ORD-001']) as OrderFeatureState
const customerBaseline=structuredClone(featureData['CUS-001']) as CustomerFeatureState

export function createOrderCustomerProvider(partialFailure=false):OrderCustomerProvider{
  const descendants=(id:string):string[]=>customerBaseline.categories.filter((item)=>item.parentId===id).flatMap((item)=>[item.id,...descendants(item.id)])
  return{categoryDescendants:(id)=>{if(partialFailure)throw new Error('原型模拟：客户分类服务不可用');return descendants(id)},getCreditLimitCents:(id)=>{if(partialFailure)throw new Error('原型模拟：客户服务不可用');return customerBaseline.customers.find((item)=>item.id===id)?.creditLimitCents??null}}
}
export function createUnavailableOrderFinanceProvider(partialFailure=false):OrderFinanceProvider{return{getCustomerSummary:()=>{if(partialFailure)throw new Error('原型模拟：资金服务不可用');return null}}}
export function createBaselineOrderRepository():InMemoryOrderRepository{return new InMemoryOrderRepository(orderBaseline)}
export type OrderScenarioName='normal'|'empty'|'error'|'slow'|'permission-denied'|'partial-failure'
const scenarios={normal:normalScenario,empty:emptyScenario,error:errorScenario,slow:slowScenario,'permission-denied':permissionScenario,'partial-failure':normalScenario} as const
export class OrderMockError extends Error{constructor(readonly code:string,message:string){super(message);this.name='OrderMockError'}}
export function createOrderMockSession(scenarioName:OrderScenarioName='normal'){
  const state=structuredClone(orderBaseline);if(scenarioName==='empty'){state.orders=[];state.printRequests=[]}
  const repository=new InMemoryOrderRepository(state);let sequence=1
  const service=createOrderService({repository,customers:createOrderCustomerProvider(scenarioName==='partial-failure'),finance:createUnavailableOrderFinanceProvider(scenarioName==='partial-failure'),now:()=>baseline.clock,nextId:(kind)=>`${kind}-runtime-${sequence++}`})
  const definition=scenarios[scenarioName]
  async function run<T>(operation:()=>T):Promise<T>{await new Promise((resolve)=>setTimeout(resolve,definition.latencyMs));if(scenarioName==='error')throw new OrderMockError('MOCK_INTERNAL_ERROR','原型模拟：订单服务暂时不可用');return operation()}
  return{scenarioName,repository,service,run}
}

