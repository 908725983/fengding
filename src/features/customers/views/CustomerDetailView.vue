<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { RouterLink, useRoute } from 'vue-router'
import { useCustomerStore } from '../runtime/customer-store'
import type { CustomerStatus } from '../types'

const route = useRoute()
const store = useCustomerStore()
const { selectedCustomer: customer, categories, tags, changeLogs, loading, error } = storeToRefs(store)
const actionError = ref<string | null>(null)
const customerId = computed(() => String(route.params.customerId))
const categoryName = computed(() => categories.value.find((item) => item.id === customer.value?.categoryId)?.name ?? '未分类')
const customerTags = computed(() => tags.value.filter((tag) => customer.value?.tagIds.includes(tag.id)))
const statusLabels = { pending: '待审核', active: '启用', inactive: '停用', frozen: '冻结' } as const
const settlementLabels = { cash: '现结', monthly: '月结', terms: '账期结算' } as const

function display(value: string | number | null | undefined): string { return value === null || value === undefined || value === '' ? '—' : String(value) }
function money(value: number | null): string { return value === null ? '—' : value === 0 ? '不限制' : `¥ ${(value / 100).toFixed(2)}` }

async function changeStatus(target: CustomerStatus): Promise<void> {
  if (!customer.value) return
  actionError.value = null
  let reason: string | undefined
  if (target === 'frozen') {
    reason = window.prompt('请输入冻结原因')?.trim()
    if (!reason) return
  } else if (!window.confirm(`确认将客户状态改为“${statusLabels[target]}”吗？`)) return
  try { await store.changeCustomerStatus(customer.value.id, target, reason) }
  catch (caught) { actionError.value = caught instanceof Error ? caught.message : '状态操作失败' }
}

onMounted(() => store.loadCustomer(customerId.value))
</script>

<template>
  <section class="detail-page">
    <div v-if="loading" class="detail-state">正在加载客户详情…</div>
    <div v-else-if="error || !customer" class="detail-state detail-state--error"><strong>无法打开客户详情</strong><p>{{ error ?? '客户不存在' }}</p><RouterLink to="/customers">返回客户列表</RouterLink></div>
    <template v-else>
      <header class="detail-header">
        <div><RouterLink class="back-link" to="/customers">← 客户列表</RouterLink><p class="eyebrow">{{ customer.code }}</p><h1>{{ customer.name }}</h1><div class="headline-meta"><span>{{ categoryName }}</span><span>{{ customer.primaryContactName }} · {{ customer.primaryPhone }}</span></div></div>
        <div class="detail-actions">
          <RouterLink class="button" :to="`/customers/${customer.id}/edit`">编辑资料</RouterLink>
          <button v-if="customer.status === 'pending'" class="button button--primary" type="button" @click="changeStatus('active')">审核启用</button>
          <button v-if="customer.status === 'active'" class="button" type="button" @click="changeStatus('inactive')">停用</button>
          <button v-if="customer.status === 'active'" class="button button--danger" type="button" @click="changeStatus('frozen')">冻结</button>
          <button v-if="customer.status === 'inactive' || customer.status === 'frozen'" class="button button--primary" type="button" @click="changeStatus('active')">恢复启用</button>
        </div>
      </header>
      <p v-if="actionError" class="action-error" role="alert">{{ actionError }}</p>

      <div class="detail-layout">
        <main class="detail-main">
          <section class="detail-card"><h2>基本信息</h2><dl class="field-grid"><div><dt>客户编码</dt><dd>{{ customer.code }}</dd></div><div><dt>客户分类</dt><dd>{{ categoryName }}</dd></div><div><dt>客户类型</dt><dd>{{ customer.customerType === 'enterprise' ? '企业客户' : customer.customerType === 'individual' ? '个人客户' : '—' }}</dd></div><div><dt>客户来源</dt><dd>{{ display(customer.source) }}</dd></div><div><dt>客户级别</dt><dd>{{ display(customer.importanceLevel) }}</dd></div><div><dt>业务员</dt><dd>{{ customer.salespersonId === 'staff-demo-1' ? '演示业务员甲' : '演示业务员乙' }}</dd></div></dl></section>
          <section class="detail-card"><h2>联系信息</h2><dl class="field-grid"><div><dt>联系人</dt><dd>{{ customer.primaryContactName }}</dd></div><div><dt>联系电话</dt><dd>{{ customer.primaryPhone }}</dd></div><div><dt>备用电话</dt><dd>{{ display(customer.backupPhone) }}</dd></div><div><dt>地区</dt><dd>{{ customer.provinceCode }} / {{ customer.cityCode }} / {{ customer.districtCode }}</dd></div><div class="field-wide"><dt>详细地址</dt><dd>{{ customer.address }}</dd></div><div><dt>邮箱</dt><dd>{{ display(customer.email) }}</dd></div><div><dt>微信号</dt><dd>{{ display(customer.wechatId) }}</dd></div></dl></section>
          <section class="detail-card"><h2>财务信息</h2><dl class="field-grid"><div><dt>信用额度</dt><dd>{{ money(customer.creditLimitCents) }}</dd></div><div><dt>结算方式</dt><dd>{{ settlementLabels[customer.settlementMethod] }}</dd></div><div><dt>账期</dt><dd>{{ customer.paymentTermDays ? `${customer.paymentTermDays} 天` : '—' }}</dd></div><div><dt>付款方式</dt><dd>{{ customer.paymentMethods.join('、') || '—' }}</dd></div><div><dt>开户行</dt><dd>{{ display(customer.bankName) }}</dd></div><div><dt>银行账号</dt><dd>{{ display(customer.bankAccount) }}</dd></div><div><dt>税号</dt><dd>{{ display(customer.taxId) }}</dd></div><div><dt>开票抬头</dt><dd>{{ display(customer.invoiceTitle) }}</dd></div></dl></section>
          <section class="detail-card"><h2>附加与预置属性</h2><dl class="field-grid"><div class="field-wide"><dt>客户简介</dt><dd>{{ display(customer.description) }}</dd></div><div><dt>法人代表</dt><dd>{{ display(customer.legalRepresentative) }}</dd></div><div><dt>注册资本</dt><dd>{{ display(customer.registeredCapital) }}</dd></div><div><dt>成立日期</dt><dd>{{ display(customer.establishedDate) }}</dd></div><div><dt>店铺面积</dt><dd>{{ display(customer.storeArea) }}</dd></div><div><dt>员工人数</dt><dd>{{ display(customer.employeeCount) }}</dd></div><div class="field-wide"><dt>经营范围</dt><dd>{{ display(customer.businessScope) }}</dd></div></dl></section>
          <section class="detail-card"><h2>跨领域指标</h2><div class="metric-grid"><div><span>累计订单数</span><strong>数据源未接入</strong></div><div><span>累计消费金额</span><strong>数据源未接入</strong></div><div><span>应收余额</span><strong>数据源未接入</strong></div></div></section>
        </main>

        <aside class="detail-aside">
          <section class="detail-card"><h2>当前状态</h2><span class="status-badge" :class="`status-badge--${customer.status}`">{{ statusLabels[customer.status] }}</span><p v-if="customer.frozenReason" class="frozen-reason">{{ customer.frozenReason }}</p><small>只有启用客户可下单</small></section>
          <section class="detail-card"><h2>客户标签</h2><div class="tag-list"><span v-for="tag in customerTags" :key="tag.id"><i :style="{ backgroundColor: tag.color }"></i>{{ tag.name }}</span><em v-if="!customerTags.length">暂无标签</em></div></section>
          <section class="detail-card"><h2>业务设置</h2><ul class="setting-list"><li :class="{ on: customer.businessSettings.canViewInventory }">查看库存</li><li :class="{ on: customer.businessSettings.canSelfOrder }">自主下单</li><li :class="{ on: customer.businessSettings.canViewPrice }">查看价格</li><li :class="{ on: customer.businessSettings.acceptsMarketing }">营销消息</li><li :class="{ on: customer.businessSettings.autoAssignOrders }">自动分配订单</li></ul><p v-if="customer.businessSettings.autoAssignOrders" class="simulation-note">原型模拟：自动分配规则尚未配置</p></section>
          <section class="detail-card"><h2>变更日志</h2><ol class="log-list"><li v-for="log in changeLogs" :key="log.id"><strong>{{ log.detail }}</strong><time>{{ log.createdAt }}</time></li><li v-if="!changeLogs.length"><span>暂无变更日志</span></li></ol></section>
        </aside>
      </div>
    </template>
  </section>
</template>

<style scoped>
.detail-page { max-width: 1500px; margin: 0 auto; }.detail-header { display: flex; gap: 24px; align-items: flex-end; justify-content: space-between; margin-bottom: 18px; }.detail-header h1 { margin: 3px 0; }.back-link { color: var(--color-primary-strong); text-decoration: none; }.headline-meta { display: flex; gap: 16px; color: var(--color-muted); }.detail-actions { display: flex; gap: 8px; }.button { display: inline-flex; min-height: 36px; align-items: center; padding: 0 14px; color: #4d5968; cursor: pointer; background: #fff; border: 1px solid var(--color-border-strong); border-radius: var(--radius-sm); text-decoration: none; }.button--primary { color: #fff; background: var(--color-primary); border-color: var(--color-primary); }.button--danger { color: var(--color-danger); border-color: #efbcbc; }.action-error { padding: 10px 12px; color: var(--color-danger); background: #fff0f0; border: 1px solid #efcaca; }.detail-layout { display: grid; grid-template-columns: minmax(0, 1fr) 310px; gap: 14px; }.detail-main, .detail-aside { display: grid; align-content: start; gap: 14px; }.detail-card { padding: 18px; background: #fff; border: 1px solid var(--color-border); border-radius: var(--radius-md); }.detail-card h2 { margin-bottom: 15px; font-size: 16px; }.field-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px 24px; margin: 0; }.field-grid div { min-width: 0; }.field-grid dt { margin-bottom: 3px; color: var(--color-muted); font-size: 12px; }.field-grid dd { margin: 0; overflow-wrap: anywhere; }.field-wide { grid-column: 1 / -1; }.metric-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }.metric-grid div { padding: 14px; background: var(--color-page); border-radius: var(--radius-sm); }.metric-grid span, .metric-grid strong { display: block; }.metric-grid span { color: var(--color-muted); font-size: 12px; }.metric-grid strong { margin-top: 5px; color: #8993a1; font-size: 13px; }.status-badge { display: inline-flex; padding: 4px 9px; border-radius: 999px; }.status-badge--active { color: var(--color-success); background: var(--color-success-soft); }.status-badge--pending { color: var(--color-warning); background: #fff7e6; }.status-badge--inactive { color: #697586; background: #eef1f5; }.status-badge--frozen { color: var(--color-danger); background: #fff0f0; }.detail-card small { display: block; margin-top: 10px; color: var(--color-muted); }.frozen-reason, .simulation-note { margin: 10px 0 0; color: var(--color-danger); font-size: 12px; }.tag-list { display: flex; flex-wrap: wrap; gap: 7px; }.tag-list span { display: inline-flex; gap: 6px; align-items: center; padding: 4px 8px; background: var(--color-page); border-radius: 999px; }.tag-list i { width: 7px; height: 7px; border-radius: 50%; }.tag-list em { color: var(--color-muted); font-style: normal; }.setting-list { display: grid; gap: 7px; padding: 0; margin: 0; list-style: none; }.setting-list li { color: #8d97a4; }.setting-list li::before { margin-right: 7px; content: "○"; }.setting-list li.on { color: var(--color-success); }.setting-list li.on::before { content: "●"; }.log-list { display: grid; gap: 12px; padding-left: 18px; margin: 0; }.log-list strong, .log-list time { display: block; }.log-list strong { font-size: 12px; }.log-list time { margin-top: 2px; color: var(--color-muted); font-size: 11px; }.detail-state { display: grid; min-height: 360px; place-items: center; align-content: center; gap: 8px; background: #fff; border: 1px solid var(--color-border); border-radius: var(--radius-md); }.detail-state--error { color: var(--color-danger); }.detail-state--error p { margin: 0; }.detail-state--error a { color: var(--color-primary-strong); }
@media (max-width: 1000px) { .detail-layout { grid-template-columns: 1fr; }.detail-header { align-items: flex-start; flex-direction: column; }.detail-aside { grid-template-columns: repeat(2, minmax(0, 1fr)); } } @media (max-width: 640px) { .field-grid, .metric-grid, .detail-aside { grid-template-columns: 1fr; }.detail-actions { flex-wrap: wrap; }.field-wide { grid-column: auto; } }
</style>
