import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import HarnessOverviewView from './HarnessOverviewView.vue'

describe('HarnessOverviewView', () => {
  it('renders role-filtered workbench regions and unavailable provider boundaries', () => {
    const wrapper = mount(HarnessOverviewView, {
      global: {
        stubs: {
          RouterLink: { template: '<a><slot /></a>' },
        },
      },
    })

    expect(wrapper.text()).toContain('首页经营概览')
    expect(wrapper.text()).toContain('待办事项')
    expect(wrapper.text()).toContain('营业情况')
    expect(wrapper.text()).toContain('预警中心')
    expect(wrapper.text()).toContain('通知公告')
    expect(wrapper.text()).toContain('unavailable')
  })
})
