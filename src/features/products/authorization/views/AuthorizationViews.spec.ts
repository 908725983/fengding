import { createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AuthorizationPlanListView from './AuthorizationPlanListView.vue'
import AuthorizationRuleListView from './AuthorizationRuleListView.vue'
import SpecialAuthorizationView from './SpecialAuthorizationView.vue'

async function mountView(component: object, path: string) {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/products/authorizations/plans', component: AuthorizationPlanListView },
    { path: '/products/authorizations/plans/new', component: { template: '<div />' } },
    { path: '/products/authorizations/plans/:planId/edit', component: { template: '<div />' } },
    { path: '/products/authorizations/rules', component: AuthorizationRuleListView },
    { path: '/products/authorizations/rules/new', component: { template: '<div />' } },
    { path: '/products/authorizations/rules/:ruleId/edit', component: { template: '<div />' } },
    { path: '/products/authorizations/specials', component: SpecialAuthorizationView },
  ] })
  await router.push(path); await router.isReady(); vi.useFakeTimers()
  const wrapper = mount(component, { global: { plugins: [createPinia(), router] } })
  await vi.advanceTimersByTimeAsync(300); await wrapper.vm.$nextTick(); return wrapper
}

describe('PRD-003 authorization workspace views', () => {
  afterEach(() => vi.useRealTimers())
  it('renders plan range, code, count and status', async () => { const wrapper = await mountView(AuthorizationPlanListView, '/products/authorizations/plans'); expect(wrapper.text()).toContain('AUTH-000001'); expect(wrapper.text()).toContain('演示华东饮品授权'); expect(wrapper.text()).toContain('按分类范围分组展示') })
  it('renders weekly rule periods and customer scope', async () => { const wrapper = await mountView(AuthorizationRuleListView, '/products/authorizations/rules'); expect(wrapper.text()).toContain('演示工作日上午授权'); expect(wrapper.text()).toContain('08:00～12:00'); expect(wrapper.text()).toContain('1 个客户') })
  it('renders special authorization types and permanent validity', async () => { const wrapper = await mountView(SpecialAuthorizationView, '/products/authorizations/specials'); expect(wrapper.text()).toContain('仅可见'); expect(wrapper.text()).toContain('禁止'); expect(wrapper.text()).toContain('永久') })
})

