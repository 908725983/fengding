import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import HarnessOverviewView from './HarnessOverviewView.vue'

describe('HarnessOverviewView', () => {
  it('clearly separates the harness baseline from business completion', () => {
    const wrapper = mount(HarnessOverviewView, {
      global: {
        stubs: {
          RouterLink: { template: '<a><slot /></a>' },
        },
      },
    })

    expect(wrapper.text()).toContain('此页面不是经营 Dashboard')
    expect(wrapper.text()).toContain('0 / 8 业务模块已实现')
    expect(wrapper.findAll('tbody tr')).toHaveLength(8)
  })
})
