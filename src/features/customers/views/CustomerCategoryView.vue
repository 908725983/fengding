<script setup lang="ts">
import { onMounted, reactive, ref, toRaw } from 'vue'
import { storeToRefs } from 'pinia'
import CustomerSubnav from '../components/CustomerSubnav.vue'
import { validateCategoryDraft } from '../schemas/customer-schema'
import { useCustomerStore } from '../runtime/customer-store'
import type { CustomerCategory, CustomerCategoryDraft } from '../types'

const store = useCustomerStore()
const { categories, loading, error } = storeToRefs(store)
const editingId = ref<string | null>(null)
const actionError = ref<string | null>(null)
const errors = reactive<Record<string, string>>({})
const draft = reactive<CustomerCategoryDraft>(emptyDraft())

function emptyDraft(parentId: string | null = null): CustomerCategoryDraft {
  return { name: '', code: '', parentId, discountRatePercent: 100, minimumOrderAmountCents: null, defaultCreditLimitCents: null, defaultPaymentTermDays: null, sortOrder: 0, icon: null, status: 'active', remark: null }
}
function reset(parentId: string | null = null): void { editingId.value = null; Object.assign(draft, emptyDraft(parentId)); Object.keys(errors).forEach((key) => delete errors[key]); actionError.value = null }
function edit(item: CustomerCategory): void { editingId.value = item.id; Object.assign(draft, structuredClone(toRaw(item))); actionError.value = null }
function depth(item: CustomerCategory): number { let value = 0; let parent = item.parentId; const seen = new Set<string>(); while (parent && !seen.has(parent)) { seen.add(parent); value += 1; parent = categories.value.find((entry) => entry.id === parent)?.parentId ?? null } return value }
function money(cents: number | null): string { return cents === null ? '—' : cents === 0 ? '不限制' : `¥ ${(cents / 100).toFixed(2)}` }

async function save(): Promise<void> {
  Object.keys(errors).forEach((key) => delete errors[key])
  for (const issue of validateCategoryDraft(draft)) if (!errors[issue.path]) errors[issue.path] = issue.message
  if (Object.keys(errors).length) return
  try { await store.saveCategory(structuredClone(toRaw(draft)), editingId.value ?? undefined); reset() }
  catch (caught) { actionError.value = caught instanceof Error ? caught.message : '分类保存失败' }
}
async function remove(item: CustomerCategory): Promise<void> {
  if (!window.confirm(`确认删除分类“${item.name}”吗？`)) return
  try { await store.deleteCategory(item.id) } catch (caught) { actionError.value = caught instanceof Error ? caught.message : '分类删除失败' }
}
onMounted(() => store.loadManagement())
function showIconHelp(): void { window.alert('原型模拟：建议 32×32，不上传真实文件') }
</script>

<template>
  <section class="manage-page"><header><div><p class="eyebrow">CUS-001 · 客户资料</p><h1>客户分类</h1><p>树形分类、折扣和新客户默认额度/账期。</p></div><button class="button button--primary" type="button" @click="reset()">新增分类</button></header><CustomerSubnav />
    <p v-if="actionError || error" class="error" role="alert">{{ actionError || error }}</p>
    <div class="manage-layout">
      <section class="list-card"><div class="card-title"><h2>分类树</h2><span>{{ categories.length }} 个分类</span></div><div v-if="loading" class="empty">正在加载…</div><table v-else><thead><tr><th>分类</th><th>编码</th><th>折扣率</th><th>起订金额</th><th>默认额度</th><th>默认账期</th><th>状态</th><th>操作</th></tr></thead><tbody><tr v-for="item in categories" :key="item.id"><td><strong :style="{ paddingLeft: `${depth(item) * 20}px` }"><span v-if="depth(item)">└ </span>{{ item.name }}</strong></td><td class="mono">{{ item.code }}</td><td>{{ item.discountRatePercent }}%</td><td>{{ money(item.minimumOrderAmountCents) }}</td><td>{{ money(item.defaultCreditLimitCents) }}</td><td>{{ item.defaultPaymentTermDays ? `${item.defaultPaymentTermDays} 天` : '—' }}</td><td><span :class="['state', item.status]">{{ item.status === 'active' ? '启用' : '停用' }}</span></td><td><button type="button" @click="edit(item)">编辑</button><button type="button" @click="reset(item.id)">新增子级</button><button class="danger" type="button" @click="remove(item)">删除</button></td></tr></tbody></table></section>
      <form class="edit-card" @submit.prevent="save"><h2>{{ editingId ? '编辑分类' : draft.parentId ? '新增子分类' : '新增分类' }}</h2><label><span>分类名称 *</span><input v-model="draft.name" maxlength="20"><em>{{ errors.name }}</em></label><label><span>分类编码 *</span><input v-model="draft.code"><em>{{ errors.code }}</em></label><label><span>上级分类</span><select v-model="draft.parentId"><option :value="null">顶级分类</option><option v-for="item in categories.filter((entry) => entry.id !== editingId)" :key="item.id" :value="item.id">{{ item.name }}</option></select></label><div class="two"><label><span>折扣率（%）*</span><input v-model.number="draft.discountRatePercent" type="number" min="1" max="100"><em>{{ errors.discountRatePercent }}</em></label><label><span>排序</span><input v-model.number="draft.sortOrder" type="number"></label></div><label><span>起订金额（分）</span><input v-model.number="draft.minimumOrderAmountCents" type="number" min="0"></label><label><span>默认信用额度（分）</span><input v-model.number="draft.defaultCreditLimitCents" type="number" min="0"></label><label><span>默认账期（天）</span><input v-model.number="draft.defaultPaymentTermDays" type="number" min="1" max="365"><em>{{ errors.defaultPaymentTermDays }}</em></label><label><span>状态</span><select v-model="draft.status"><option value="active">启用</option><option value="inactive">停用</option></select></label><label><span>备注</span><textarea v-model="draft.remark" rows="3"></textarea></label><div class="fake-upload"><span>分类图标</span><button class="button" type="button" @click="showIconHelp">模拟上传</button></div><div class="form-actions"><button class="button" type="button" @click="reset()">取消</button><button class="button button--primary" type="submit">保存分类</button></div></form>
    </div>
  </section>
</template>

<style scoped>
.manage-page { max-width: 1680px; margin: 0 auto; }.manage-page > header { display: flex; align-items: flex-end; justify-content: space-between; margin-bottom: 14px; }.manage-page h1 { margin-bottom: 4px; }.manage-page header p { margin-bottom: 0; color: var(--color-muted); }.button { min-height: 36px; padding: 0 14px; cursor: pointer; background: #fff; border: 1px solid var(--color-border-strong); border-radius: var(--radius-sm); }.button--primary { color: #fff; background: var(--color-primary); border-color: var(--color-primary); }.error { margin: 12px 0 0; padding: 10px; color: var(--color-danger); background: #fff0f0; border: 1px solid #efcaca; }.manage-layout { display: grid; grid-template-columns: minmax(0, 1fr) 330px; gap: 14px; margin-top: 14px; }.list-card, .edit-card { overflow: hidden; background: #fff; border: 1px solid var(--color-border); border-radius: var(--radius-md); }.list-card { overflow-x: auto; overflow-y: hidden; }.card-title { display: flex; align-items: center; justify-content: space-between; padding: 14px; }.card-title h2 { margin: 0; }.card-title span { color: var(--color-muted); font-size: 12px; }table { width: 100%; min-width: 900px; border-collapse: collapse; }th, td { padding: 10px 12px; text-align: left; white-space: nowrap; border-top: 1px solid var(--color-border); }th { color: var(--color-muted); font-size: 12px; background: var(--color-table-head); }th:last-child, td:last-child { position: sticky; right: 0; background: #fff; box-shadow: -6px 0 8px rgba(30, 48, 75, .06); }th:last-child { background: var(--color-table-head); }td button { padding: 0; margin-right: 9px; color: var(--color-primary-strong); cursor: pointer; background: transparent; border: 0; }.danger { color: var(--color-danger); }.mono { font-family: Consolas, monospace; font-size: 12px; }.state { padding: 3px 7px; border-radius: 999px; }.state.active { color: var(--color-success); background: var(--color-success-soft); }.state.inactive { color: var(--color-muted); background: #eef1f5; }.edit-card { display: grid; align-content: start; gap: 11px; padding: 16px; }.edit-card h2 { margin-bottom: 2px; }.edit-card label, .fake-upload { display: grid; gap: 4px; color: var(--color-muted); font-size: 12px; }.edit-card input, .edit-card select, .edit-card textarea { width: 100%; min-height: 35px; padding: 6px 8px; border: 1px solid var(--color-border-strong); border-radius: var(--radius-sm); }.edit-card em { color: var(--color-danger); font-size: 11px; font-style: normal; }.two { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }.form-actions { display: flex; justify-content: flex-end; }.form-actions .button + .button { margin-left: 8px; }.empty { display: grid; min-height: 220px; place-items: center; color: var(--color-muted); }
@media (max-width: 1100px) { .manage-layout { grid-template-columns: 1fr; }.list-card { overflow-x: auto; } } @media (max-width: 640px) { .manage-page > header { align-items: flex-start; flex-direction: column; gap: 10px; }.two { grid-template-columns: 1fr; } }
</style>
