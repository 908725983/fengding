import { createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DistributionPlanListView from './DistributionPlanListView.vue'
import OrderTemplateListView from './OrderTemplateListView.vue'
import DistributionPreviewView from './DistributionPreviewView.vue'
import DistributionStatisticsView from './DistributionStatisticsView.vue'

async function mountView(component: object,path:string){const router=createRouter({history:createMemoryHistory(),routes:[{path:'/products/distribution/plans',component:DistributionPlanListView},{path:'/products/distribution/plans/new',component:{template:'<div />'}},{path:'/products/distribution/plans/:planId/edit',component:{template:'<div />'}},{path:'/products/order-templates',component:OrderTemplateListView},{path:'/products/order-templates/new',component:{template:'<div />'}},{path:'/products/order-templates/:templateId/edit',component:{template:'<div />'}},{path:'/products/distribution/preview',component:DistributionPreviewView},{path:'/products/distribution/statistics',component:DistributionStatisticsView}]});await router.push(path);await router.isReady();vi.useFakeTimers();const wrapper=mount(component,{global:{plugins:[createPinia(),router]}});await vi.advanceTimersByTimeAsync(360);await wrapper.vm.$nextTick();return wrapper}

describe('PRD-004 distribution workspace views',()=>{
  afterEach(()=>vi.useRealTimers())
  it('renders distribution plan contract columns',async()=>{const wrapper=await mountView(DistributionPlanListView,'/products/distribution/plans');expect(wrapper.text()).toContain('演示重点客户铺货');expect(wrapper.text()).toContain('指定区域/分类/标签');expect(wrapper.text()).toContain('商品种数')})
  it('renders template channel and scope fields',async()=>{const wrapper=await mountView(OrderTemplateListView,'/products/order-templates');expect(wrapper.text()).toContain('演示常用订货模板');expect(wrapper.text()).toContain('自主下单');expect(wrapper.text()).toContain('全部客户')})
  it('previews accepted and rejected suggestion sections',async()=>{const wrapper=await mountView(DistributionPreviewView,'/products/distribution/preview');expect(wrapper.text()).toContain('不创建订单');await wrapper.get('button.primary').trigger('click');await vi.advanceTimersByTimeAsync(120);await wrapper.vm.$nextTick();expect(wrapper.text()).toContain('可接受明细');expect(wrapper.text()).toContain('跳过与拒绝')})
  it('does not fabricate order statistics',async()=>{const wrapper=await mountView(DistributionStatisticsView,'/products/distribution/statistics');expect(wrapper.text()).toContain('统计暂不可用');expect(wrapper.text()).toContain('订单数据源未接入')})
})
