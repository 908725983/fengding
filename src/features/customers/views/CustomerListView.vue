<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { RouterLink } from 'vue-router'
import { useCustomerStore } from '../runtime/customer-store'
import type { CustomerListQuery } from '../types'
import type { CustomerScenarioName } from '../../../../mock/handlers/customer-handler'

const store = useCustomerStore()
const { result, categories, tags, loading, error, isEmpty, scenario } = storeToRefs(store)
const showMore = ref(false)
const filters = reactive({
  categoryId: '', tagIds: [] as string[], salespersonId: '', status: '', keyword: '',
  regionCode: '', registeredFrom: '', registeredTo: '',
})

const statusLabels = { pending: '待审核', active: '启用', inactive: '停用', frozen: '冻结' } as const

function toggleTag(tagId: string): void {
  const index = filters.tagIds.indexOf(tagId)
  if (index >= 0) filters.tagIds.splice(index, 1)
  else filters.tagIds.push(tagId)
}

function buildQuery(): CustomerListQuery {
  return {
    categoryId: filters.categoryId || undefined,
    tagIds: filters.tagIds.length ? [...filters.tagIds] : undefined,
    salespersonId: filters.salespersonId || undefined,
    status: (filters.status || undefined) as CustomerListQuery['status'],
    keyword: filters.keyword || undefined,
    regionCodes: filters.regionCode ? [filters.regionCode.trim()] : undefined,
    registeredFrom: filters.registeredFrom ? `${filters.registeredFrom}T00:00:00+08:00` : undefined,
    registeredTo: filters.registeredTo ? `${filters.registeredTo}T23:59:59+08:00` : undefined,
    pageSize: result.value.pageSize as 10 | 30 | 50 | 100,
  }
}

async function reset(): Promise<void> {
  Object.assign(filters, { categoryId: '', tagIds: [], salespersonId: '', status: '', keyword: '', regionCode: '', registeredFrom: '', registeredTo: '' })
  await store.resetQuery()
}

async function switchScenario(event: Event): Promise<void> {
  await store.setScenario((event.target as HTMLSelectElement).value as CustomerScenarioName)
}

onMounted(() => store.load())
</script>

<template>
  <section class="customer-page" aria-labelledby="customer-title">
    <header class="customer-header">
      <div>
        <p class="eyebrow">CUS-001 · 客户档案</p>
        <h1 id="customer-title">客户列表</h1>
        <p>管理客户主数据、分类与标签。订单、消费和应收数据源尚未接入。</p>
      </div>
      <div class="customer-header__actions">
        <label class="scenario-control">
          <span>模拟场景</span>
          <select :value="scenario" @change="switchScenario">
            <option value="normal">正常</option>
            <option value="empty">空数据</option>
            <option value="error">服务错误</option>
            <option value="slow">慢响应</option>
            <option value="permission-denied">无权限</option>
          </select>
        </label>
        <RouterLink class="button button--primary button-link" to="/customers/new">新增客户</RouterLink>
      </div>
    </header>

    <nav class="customer-tabs" aria-label="客户模块二级导航">
      <RouterLink class="customer-tabs__item customer-tabs__item--active" to="/customers">客户列表</RouterLink>
      <RouterLink class="customer-tabs__item" to="/customers/categories">客户分类</RouterLink>
      <RouterLink class="customer-tabs__item" to="/customers/tags">客户标签</RouterLink>
      <RouterLink class="customer-tabs__item" to="/customers/smart-tags">智能标签</RouterLink>
      <span class="customer-tabs__item customer-tabs__item--planned">其余功能 · 规划中</span>
    </nav>

    <form class="filter-panel" @submit.prevent="store.applyQuery(buildQuery())">
      <div class="filter-grid">
        <label><span>客户分类</span><select v-model="filters.categoryId"><option value="">全部分类</option><option v-for="item in categories" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
        <label><span>业务员</span><select v-model="filters.salespersonId"><option value="">全部业务员</option><option value="staff-demo-1">演示业务员甲</option><option value="staff-demo-2">演示业务员乙</option></select></label>
        <label><span>客户状态</span><select v-model="filters.status"><option value="">全部状态</option><option value="pending">待审核</option><option value="active">启用</option><option value="inactive">停用</option><option value="frozen">冻结</option></select></label>
        <label class="filter-keyword"><span>关键词</span><input v-model="filters.keyword" type="search" placeholder="名称 / 编码 / 联系人 / 电话"></label>
      </div>

      <div class="tag-filter" aria-label="客户标签筛选">
        <span>客户标签（任一命中）</span>
        <button v-for="tag in tags" :key="tag.id" class="tag-choice" :class="{ 'tag-choice--selected': filters.tagIds.includes(tag.id) }" type="button" @click="toggleTag(tag.id)">
          <i :style="{ backgroundColor: tag.color }"></i>{{ tag.name }}
        </button>
      </div>

      <div v-if="showMore" class="more-filters">
        <label><span>地区编码</span><input v-model="filters.regionCode" placeholder="模拟地区编码"></label>
        <label><span>注册开始</span><input v-model="filters.registeredFrom" type="date"></label>
        <label><span>注册结束</span><input v-model="filters.registeredTo" type="date"></label>
        <label><span>交易金额</span><input disabled placeholder="数据源未接入"></label>
      </div>

      <div class="filter-actions">
        <button class="link-button" type="button" @click="showMore = !showMore">{{ showMore ? '收起筛选' : '更多筛选' }}</button>
        <div><button class="button" type="button" @click="reset">重置</button><button class="button button--primary" type="submit">查询</button></div>
      </div>
    </form>

    <div v-if="error" class="state-panel state-panel--error" role="alert">
      <strong>客户数据加载失败</strong><p>{{ error }}</p><button class="button" type="button" @click="store.load">重试</button>
    </div>
    <div v-else-if="loading" class="state-panel" aria-live="polite"><span class="spinner"></span><strong>正在加载客户数据…</strong></div>
    <div v-else-if="isEmpty" class="state-panel"><strong>暂无客户数据</strong><p>当前筛选或模拟场景没有客户记录。</p><RouterLink class="button button--primary button-link" to="/customers/new">新增客户</RouterLink></div>

    <template v-else>
      <div class="table-meta"><strong>客户档案</strong><span>共 {{ result.total }} 条 · 默认按创建时间倒序</span></div>
      <div class="customer-table-wrap">
        <table class="customer-table">
          <thead><tr><th>客户编码</th><th>客户名称</th><th>客户分类</th><th>联系人</th><th>联系电话</th><th>所在地区</th><th>业务员</th><th>累计订单数</th><th>累计消费</th><th>应收余额</th><th>状态</th><th>操作</th></tr></thead>
          <tbody>
            <tr v-for="customer in result.items" :key="customer.id">
              <td class="mono">{{ customer.code }}</td>
              <td><RouterLink class="customer-name-link" :to="`/customers/${customer.id}`">{{ customer.name }}</RouterLink></td>
              <td><span class="soft-tag">{{ customer.categoryName }}</span></td>
              <td>{{ customer.primaryContactName }}</td><td>{{ customer.primaryPhone }}</td>
              <td>{{ [customer.provinceCode, customer.cityCode, customer.districtCode].join(' / ') }}</td>
              <td>{{ customer.salespersonName }}</td>
              <td><span class="unavailable">未接入</span></td><td><span class="unavailable">未接入</span></td><td><span class="unavailable">未接入</span></td>
              <td><span class="customer-status" :class="`customer-status--${customer.status}`">{{ statusLabels[customer.status] }}</span></td>
              <td><RouterLink class="table-action" :to="`/customers/${customer.id}`">详情</RouterLink><RouterLink class="table-action" :to="`/customers/${customer.id}/edit`">编辑</RouterLink></td>
            </tr>
          </tbody>
        </table>
      </div>
      <footer class="pagination">
        <span>第 {{ result.page }} 页</span>
        <button class="button" type="button" :disabled="result.page <= 1" @click="store.setPage(result.page - 1)">上一页</button>
        <button class="button" type="button" :disabled="result.page * result.pageSize >= result.total" @click="store.setPage(result.page + 1)">下一页</button>
      </footer>
    </template>
  </section>
</template>

<style scoped>
.customer-page { max-width: 1680px; margin: 0 auto; }
.customer-header { display: flex; gap: 20px; align-items: flex-start; justify-content: space-between; margin-bottom: 14px; }
.customer-header h1 { margin-bottom: 4px; font-size: 22px; }
.customer-header p { margin-bottom: 0; color: var(--color-muted); }
.customer-header__actions { display: flex; gap: 10px; align-items: flex-end; }
.scenario-control { display: grid; gap: 4px; color: var(--color-muted); font-size: 12px; }
select, input { min-height: 36px; padding: 6px 10px; color: var(--color-text); background: #fff; border: 1px solid var(--color-border-strong); border-radius: var(--radius-sm); }
.button { min-height: 36px; padding: 0 15px; color: #4d5968; cursor: pointer; background: #fff; border: 1px solid var(--color-border-strong); border-radius: var(--radius-sm); }
.button + .button { margin-left: 8px; }
.button--primary { color: #fff; background: var(--color-primary); border-color: var(--color-primary); }
.button:disabled { cursor: not-allowed; opacity: .55; }
.button-link { display: inline-flex; align-items: center; text-decoration: none; }
.customer-tabs { display: flex; gap: 24px; min-height: 44px; padding: 0 18px; background: #fff; border: 1px solid var(--color-border); border-bottom: 0; border-radius: var(--radius-md) var(--radius-md) 0 0; }
.customer-tabs__item { display: flex; align-items: center; color: var(--color-muted); }
.customer-tabs__item { text-decoration: none; }
.customer-tabs__item--active { color: var(--color-primary-strong); font-weight: 700; border-bottom: 2px solid var(--color-primary); }
.customer-tabs__item--planned { margin-left: auto; font-size: 12px; }
.filter-panel { padding: 16px 18px 12px; background: #fff; border: 1px solid var(--color-border); }
.filter-grid { display: grid; grid-template-columns: 180px 180px 160px minmax(260px, 1fr); gap: 12px; }
.filter-grid label, .more-filters label { display: grid; gap: 5px; color: var(--color-muted); font-size: 12px; }
.tag-filter { display: flex; gap: 8px; align-items: center; min-height: 38px; margin-top: 10px; color: var(--color-muted); font-size: 12px; }
.tag-choice { display: inline-flex; gap: 6px; align-items: center; min-height: 28px; padding: 0 9px; cursor: pointer; background: #fff; border: 1px solid var(--color-border); border-radius: 999px; }
.tag-choice i { width: 7px; height: 7px; border-radius: 50%; }
.tag-choice--selected { color: var(--color-primary-strong); background: var(--color-primary-soft); border-color: #9bd4d1; }
.more-filters { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; padding-top: 12px; border-top: 1px dashed var(--color-border); }
.filter-actions { display: flex; align-items: center; justify-content: space-between; padding-top: 12px; }
.link-button, .table-action, .customer-name-link { padding: 0; color: var(--color-primary-strong); cursor: pointer; background: transparent; border: 0; text-decoration: none; }
.customer-name-link { font-weight: 700; }
.table-action + .table-action { margin-left: 10px; }
.table-action:disabled { color: #9aa4b1; cursor: not-allowed; }
.state-panel { display: grid; min-height: 260px; place-items: center; align-content: center; gap: 8px; margin-top: 14px; padding: 30px; color: var(--color-muted); background: #fff; border: 1px solid var(--color-border); border-radius: var(--radius-md); text-align: center; }
.state-panel p { margin: 0; }.state-panel--error strong { color: var(--color-danger); }
.spinner { width: 24px; height: 24px; border: 3px solid #cfe8e6; border-top-color: var(--color-primary); border-radius: 50%; animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.table-meta { display: flex; justify-content: space-between; margin-top: 14px; padding: 12px 14px; background: #fff; border: 1px solid var(--color-border); border-bottom: 0; border-radius: var(--radius-md) var(--radius-md) 0 0; }
.table-meta span { color: var(--color-muted); font-size: 12px; }
.customer-table-wrap { overflow-x: auto; background: #fff; border: 1px solid var(--color-border); }
.customer-table { width: 100%; min-width: 1500px; border-collapse: collapse; }
.customer-table th, .customer-table td { height: 48px; padding: 9px 12px; text-align: left; white-space: nowrap; border-bottom: 1px solid var(--color-border); }
.customer-table th { color: #4d5968; font-size: 12px; background: var(--color-table-head); }
.customer-table tbody tr:hover { background: #fafcfd; }.mono { font-family: "Cascadia Code", Consolas, monospace; font-size: 12px; }
.soft-tag, .customer-status { display: inline-flex; min-height: 24px; align-items: center; padding: 0 8px; border-radius: 999px; font-size: 12px; }
.soft-tag { color: var(--color-primary-strong); background: var(--color-primary-soft); }
.customer-status--active { color: var(--color-success); background: var(--color-success-soft); }.customer-status--pending { color: var(--color-warning); background: #fff7e6; }.customer-status--inactive { color: #697586; background: #eef1f5; }.customer-status--frozen { color: var(--color-danger); background: #fff0f0; }
.unavailable { color: #8993a1; font-size: 12px; }.pagination { display: flex; gap: 8px; align-items: center; justify-content: flex-end; padding: 12px; background: #fff; border: 1px solid var(--color-border); border-top: 0; border-radius: 0 0 var(--radius-md) var(--radius-md); }.pagination span { margin-right: 8px; color: var(--color-muted); }
@media (max-width: 1000px) { .filter-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }.more-filters { grid-template-columns: repeat(2, minmax(0, 1fr)); }.customer-header { display: block; }.customer-header__actions { margin-top: 12px; }.customer-tabs { overflow-x: auto; }.customer-tabs__item { flex: 0 0 auto; }.customer-tabs__item--planned { margin-left: 0; } }
@media (max-width: 600px) { .filter-grid, .more-filters { grid-template-columns: 1fr; }.customer-header__actions { align-items: stretch; flex-direction: column; }.tag-filter { align-items: flex-start; flex-wrap: wrap; }.filter-actions { gap: 10px; align-items: stretch; flex-direction: column; }.filter-actions > div { display: flex; }.filter-actions .button { flex: 1; } }
</style>
