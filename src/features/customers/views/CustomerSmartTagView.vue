<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import CustomerSubnav from '../components/CustomerSubnav.vue'
import { useCustomerStore } from '../runtime/customer-store'
import type { AnalysisScope, CustomerTagSuggestion } from '../types'

const store = useCustomerStore()
const { suggestions, tags, result, loading, error } = storeToRefs(store)
const scope = ref<AnalysisScope>('all')
const conditionKeyword = ref('')
const specifiedIds = ref<string[]>([])
const selectedSuggestionIds = ref<string[]>([])
const actionError = ref<string | null>(null)
const pendingSuggestions = computed(() => suggestions.value.filter((item) => item.status === 'pending'))
const analysisCount = computed(() => scope.value === 'specified' ? specifiedIds.value.length : scope.value === 'conditions' ? '按条件计算' : result.value.total)

function customerName(id: string): string { return result.value.items.find((item) => item.id === id)?.name ?? '未知客户' }
function tagName(id: string): string { return tags.value.find((item) => item.id === id)?.name ?? '未知标签' }
function toggleSuggestion(id: string): void { const index = selectedSuggestionIds.value.indexOf(id); if (index >= 0) selectedSuggestionIds.value.splice(index, 1); else selectedSuggestionIds.value.push(id) }
function selectAllPending(): void { selectedSuggestionIds.value = selectedSuggestionIds.value.length === pendingSuggestions.value.length ? [] : pendingSuggestions.value.map((item) => item.id) }

async function analyze(): Promise<void> {
  actionError.value = null
  if (scope.value === 'conditions' && !conditionKeyword.value.trim()) { actionError.value = '按条件筛选时至少填写一个关键词条件'; return }
  try {
    await store.analyzeTags({ scope: scope.value, conditions: scope.value === 'conditions' ? { keyword: conditionKeyword.value.trim() } : undefined, customerIds: scope.value === 'specified' ? specifiedIds.value : undefined })
  } catch (caught) { actionError.value = caught instanceof Error ? caught.message : '立即分析失败' }
}
async function resolve(ids: string[], decision: 'confirm' | 'reject'): Promise<void> {
  actionError.value = null
  if (!ids.length) { actionError.value = '请先选择待处理建议'; return }
  try { await store.resolveSuggestions(ids, decision); selectedSuggestionIds.value = [] }
  catch (caught) { actionError.value = caught instanceof Error ? caught.message : '建议处理失败' }
}
function resolveOne(item: CustomerTagSuggestion, decision: 'confirm' | 'reject'): void { void resolve([item.id], decision) }
function showSchedule(): void { window.alert('定时分析：规划中。需求未提供调度字段，本切片不保存伪配置。') }
function exportSimulation(): void {
  const content = JSON.stringify({ prototype: true, exportedAt: '2026-08-10T09:00:00+08:00', suggestions: suggestions.value }, null, 2)
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = '原型模拟-智能标签.json'; anchor.click(); URL.revokeObjectURL(url)
}
onMounted(() => store.loadManagement())
</script>

<template>
  <section class="smart-page"><header><div><p class="eyebrow">CUS-001 · Fake AI</p><h1>客户智能标签</h1><p>AI 只生成建议；人工确认前不会修改客户有效标签。</p></div><div><button class="button" type="button" @click="exportSimulation">导出模拟结果</button><button class="button" type="button" @click="showSchedule">定时分析 · 规划中</button></div></header><CustomerSubnav />
    <p v-if="actionError || error" class="error" role="alert">{{ actionError || error }}</p>
    <section class="analysis-card"><div><h2>立即分析</h2><p><span class="simulation-chip">原型模拟</span> 使用确定性 fake AI，不请求外部服务。</p></div><div class="scope-options"><label><input v-model="scope" type="radio" value="all">全部客户</label><label><input v-model="scope" type="radio" value="conditions">按条件筛选</label><label><input v-model="scope" type="radio" value="specified">指定客户</label></div><input v-if="scope === 'conditions'" v-model="conditionKeyword" class="condition-input" placeholder="客户名称/编码/联系人/电话关键词"><div v-if="scope === 'specified'" class="customer-choices"><label v-for="customer in result.items" :key="customer.id"><input v-model="specifiedIds" type="checkbox" :value="customer.id">{{ customer.name }}</label></div><div class="analysis-action"><span>预计分析：{{ analysisCount }} 个客户，最多 1000</span><button class="button button--primary" type="button" :disabled="loading" @click="analyze">{{ loading ? '分析中…' : '立即分析' }}</button></div></section>

    <section class="suggestion-card"><div class="card-title"><div><h2>标签建议</h2><p>待处理 {{ pendingSuggestions.length }} 条，共 {{ suggestions.length }} 条</p></div><div><button class="button" type="button" @click="selectAllPending">{{ selectedSuggestionIds.length === pendingSuggestions.length && pendingSuggestions.length ? '取消全选' : '全选待处理' }}</button><button class="button" type="button" @click="resolve(selectedSuggestionIds, 'reject')">批量拒绝</button><button class="button button--primary" type="button" @click="resolve(selectedSuggestionIds, 'confirm')">批量确认</button></div></div><div v-if="loading" class="empty">正在加载…</div><table v-else><thead><tr><th></th><th>客户</th><th>建议动作</th><th>标签</th><th>状态</th><th>修改时间</th><th>操作</th></tr></thead><tbody><tr v-for="item in suggestions" :key="item.id"><td><input v-if="item.status === 'pending'" type="checkbox" :checked="selectedSuggestionIds.includes(item.id)" @change="toggleSuggestion(item.id)"></td><td>{{ customerName(item.customerId) }}</td><td><span :class="['action-tag', item.action]">{{ item.action === 'add' ? '建议新增' : '建议移除' }}</span></td><td>{{ tagName(item.tagId) }}</td><td>{{ item.status === 'pending' ? '待人工确认' : item.status === 'confirmed' ? '已确认' : '已拒绝' }}</td><td>{{ item.resolvedAt || item.createdAt }}</td><td><template v-if="item.status === 'pending'"><button type="button" @click="resolveOne(item, 'confirm')">确认</button><button class="danger" type="button" @click="resolveOne(item, 'reject')">拒绝</button></template><span v-else>已处理</span></td></tr><tr v-if="!suggestions.length"><td colspan="7" class="empty">暂无智能标签建议</td></tr></tbody></table></section>
  </section>
</template>

<style scoped>
.smart-page { max-width: 1600px; margin: 0 auto; }.smart-page > header { display: flex; align-items: flex-end; justify-content: space-between; margin-bottom: 14px; }.smart-page h1 { margin-bottom: 4px; }.smart-page header p { margin-bottom: 0; color: var(--color-muted); }.button { min-height: 36px; padding: 0 14px; cursor: pointer; background: #fff; border: 1px solid var(--color-border-strong); border-radius: var(--radius-sm); }.button + .button { margin-left: 8px; }.button--primary { color: #fff; background: var(--color-primary); border-color: var(--color-primary); }.button:disabled { opacity: .55; }.error { margin: 12px 0 0; padding: 10px; color: var(--color-danger); background: #fff0f0; border: 1px solid #efcaca; }.analysis-card, .suggestion-card { margin-top: 14px; padding: 16px; background: #fff; border: 1px solid var(--color-border); border-radius: var(--radius-md); }.analysis-card h2, .card-title h2 { margin-bottom: 3px; }.analysis-card p, .card-title p { margin: 0; color: var(--color-muted); font-size: 12px; }.simulation-chip { margin-right: 5px; padding: 2px 6px; color: var(--color-primary-strong); background: var(--color-primary-soft); border-radius: 999px; }.scope-options, .customer-choices { display: flex; gap: 18px; flex-wrap: wrap; margin-top: 14px; }.scope-options label, .customer-choices label { display: flex; gap: 6px; align-items: center; }.condition-input { width: min(460px, 100%); min-height: 36px; margin-top: 12px; padding: 7px 9px; border: 1px solid var(--color-border-strong); border-radius: var(--radius-sm); }.customer-choices { padding: 10px; background: var(--color-page); }.analysis-action { display: flex; align-items: center; justify-content: space-between; margin-top: 15px; padding-top: 13px; color: var(--color-muted); border-top: 1px dashed var(--color-border); }.card-title { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }table { width: 100%; min-width: 850px; border-collapse: collapse; }th, td { padding: 10px 12px; text-align: left; border-top: 1px solid var(--color-border); }th { color: var(--color-muted); font-size: 12px; background: var(--color-table-head); }td button { padding: 0; margin-right: 10px; color: var(--color-primary-strong); cursor: pointer; background: none; border: 0; }.danger { color: var(--color-danger); }.action-tag { padding: 3px 7px; border-radius: 999px; }.action-tag.add { color: var(--color-success); background: var(--color-success-soft); }.action-tag.remove { color: var(--color-danger); background: #fff0f0; }.empty { padding: 40px; color: var(--color-muted); text-align: center; }
@media (max-width: 760px) { .smart-page > header, .card-title, .analysis-action { align-items: flex-start; flex-direction: column; gap: 10px; }.suggestion-card { overflow-x: auto; } }
</style>
