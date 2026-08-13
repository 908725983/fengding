import { createPinia,setActivePinia } from 'pinia'
import { mount,flushPromises } from '@vue/test-utils'
import { createMemoryHistory,createRouter } from 'vue-router'
import { beforeEach,describe,expect,it } from 'vitest'
import OrderListView from './OrderListView.vue'
import OrderDetailView from './OrderDetailView.vue'

async function setup(component:typeof OrderListView,path='/orders'){
  const router=createRouter({history:createMemoryHistory(),routes:[{path:'/orders',component:OrderListView},{path:'/orders/:orderId',component:OrderDetailView}]});await router.push(path);await router.isReady();const wrapper=mount(component,{global:{plugins:[createPinia(),router]}});await new Promise((resolve)=>setTimeout(resolve,180));await flushPromises();return{wrapper,router}
}
describe('order views',()=>{beforeEach(()=>setActivePinia(createPinia()));it('renders dense list and canonical status labels',async()=>{const {wrapper}=await setup(OrderListView);expect(wrapper.text()).toContain('客户订单列表');expect(wrapper.text()).toContain('共 32 条');expect(wrapper.findAll('tbody tr')).toHaveLength(30);expect(wrapper.text()).toContain('已审核（待出库）');expect(wrapper.text()).not.toContain('急 / 赠 / 退 / 锁')});it('renders detail snapshots and unavailable external providers',async()=>{const {wrapper}=await setup(OrderDetailView,'/orders/order-001');expect(wrapper.text()).toContain('CA000000-260710-60001');expect(wrapper.text()).toContain('演示基础商品');expect(wrapper.text()).toContain('资金数据源尚未接入');expect(wrapper.text()).toContain('库荐算法尚未接入')});it('shows future tabs as explicit unavailable states',async()=>{const {wrapper}=await setup(OrderDetailView,'/orders/order-001');await wrapper.findAll('.order-tabs button')[1]!.trigger('click');expect(wrapper.text()).toContain('出库发货记录由 ORD-004 提供');expect(wrapper.text()).toContain('不以空表或 0 冒充')})})
