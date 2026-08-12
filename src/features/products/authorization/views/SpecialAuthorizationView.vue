<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { storeToRefs } from 'pinia'
import AuthorizationSubnav from '../components/AuthorizationSubnav.vue'
import { useAuthorizationStore } from '../runtime/authorization-store'
import type { SpecialAuthorizationBatchDraft, SpecialAuthorizationListItem, SpecialAuthorizationType } from '../types'

const store = useAuthorizationStore()
const { specials, options, loading, error, isEmpty, canWrite, saving } = storeToRefs(store)
const filters = reactive({ customerKeyword: '', type: '', effective: '' })
const form = reactive<SpecialAuthorizationBatchDraft>({ customerIds: [], productIds: [], type: 'visible-orderable', startsAt: '2026-08-10T09:00:00+08:00', endsAt: null, note: null })
const formError = ref<string | null>(null)
const showForm = ref(false)
const editingId = ref<string | null>(null)
const labels: Record<SpecialAuthorizationType, string> = { 'visible-orderable': '可见+可订', 'visible-only': '仅可见', prohibited: '禁止' }

function search() { return store.applySpecialQuery({ customerKeyword: filters.customerKeyword || undefined, type: (filters.type || undefined) as SpecialAuthorizationType | undefined, effective: (filters.effective || undefined) as 'effective' | 'future' | 'expired' | undefined, pageSize: 30 }) }
function localIso(value: string): string | null { return value ? `${value}:00+08:00` : null }
function resetForm() { editingId.value = null; Object.assign(form, { customerIds: [], productIds: [], type: 'visible-orderable', startsAt: '2026-08-10T09:00:00+08:00', endsAt: null, note: null }) }
function toggleForm() { showForm.value = !showForm.value; if (!showForm.value) resetForm() }
function edit(item: SpecialAuthorizationListItem) { editingId.value = item.id; showForm.value = true; Object.assign(form, { customerIds: [item.customerId], productIds: [item.productId], type: item.type, startsAt: item.startsAt, endsAt: item.endsAt, note: item.note }) }
async function save() {
  formError.value = null
  try {
    const input = { type: form.type, startsAt: localIso(form.startsAt.slice(0, 16))!, endsAt: form.endsAt ? localIso(form.endsAt.slice(0, 16)) : null, note: form.note }
    if (editingId.value) await store.updateSpecial(editingId.value, input)
    else await store.createSpecial({ ...form, ...input })
    showForm.value = false; resetForm()
  } catch (caught) { formError.value = caught instanceof Error ? caught.message : '保存失败' }
}
async function remove(id: string) { if (window.confirm('确认删除该特殊授权吗？删除后立即不再覆盖基础授权。')) await store.deleteSpecial(id) }
onMounted(() => store.load('specials'))
</script>

<template>
  <section class="auth-page">
    <header class="page-header"><div><p class="eyebrow">PRD-003 · 商品授权</p><h1>客户特殊授权</h1><p>按客户×SPU 保存，特殊授权覆盖方案和规则，优先级：禁止 &gt; 仅可见 &gt; 可见+可订。</p></div><button v-if="canWrite" class="button primary" @click="toggleForm">{{ showForm ? '收起表单' : '新增特殊授权' }}</button></header>
    <AuthorizationSubnav />
    <form class="filters" @submit.prevent="search"><label><span>客户</span><input v-model="filters.customerKeyword" placeholder="名称或编码"></label><label><span>授权类型</span><select v-model="filters.type"><option value="">全部</option><option v-for="(label,key) in labels" :key="key" :value="key">{{ label }}</option></select></label><label><span>有效状态</span><select v-model="filters.effective"><option value="">全部</option><option value="effective">当前有效</option><option value="future">待生效</option><option value="expired">已失效</option></select></label><button class="button primary">查询</button></form>
    <form v-if="showForm" class="form-card special-form" @submit.prevent="save"><h2>{{ editingId ? '编辑特殊授权' : '新增特殊授权' }} <small>{{ editingId ? '客户和商品不可变' : '整批原子提交' }}</small></h2><p v-if="formError" class="warning">{{ formError }}</p><div class="form-grid"><div class="field full"><span>选择客户 *</span><div class="checks"><label v-for="customer in options.customers.filter(item=>item.status==='active')" :key="customer.id"><input v-model="form.customerIds" :disabled="Boolean(editingId)" type="checkbox" :value="customer.id">{{ customer.code }} · {{ customer.name }}</label></div></div><label class="field"><span>授权类型 *</span><select v-model="form.type"><option v-for="(label,key) in labels" :key="key" :value="key">{{ label }}</option></select></label><label class="field"><span>备注</span><input v-model="form.note" maxlength="500"></label><div class="field full"><span>选择商品 *</span><div class="checks"><label v-for="product in options.products.filter(item=>!item.deletedAt)" :key="product.id"><input v-model="form.productIds" :disabled="Boolean(editingId)" type="checkbox" :value="product.id">{{ product.code }} · {{ product.name }}</label></div></div><label class="field"><span>开始时间 *</span><input v-model="form.startsAt" type="datetime-local"></label><label class="field"><span>结束时间（不填永久）</span><input v-model="form.endsAt" type="datetime-local"></label></div><div class="form-actions"><button class="button primary" :disabled="saving">{{ saving ? '保存中…' : editingId ? '保存修改' : '保存特殊授权' }}</button></div></form>
    <div v-if="error" class="state error">{{ error }}</div><div v-else-if="loading" class="state">正在加载特殊授权…</div><div v-else-if="isEmpty" class="state"><strong>暂无特殊授权</strong></div>
    <div v-else class="table-wrap"><table><thead><tr><th>客户名称</th><th>客户分类</th><th>授权商品数</th><th>商品</th><th>授权类型</th><th>有效期</th><th>备注</th><th>操作</th></tr></thead><tbody><tr v-for="item in specials.items" :key="item.id"><td>{{ item.customerName }}<small class="block mono">{{ item.customerCode }}</small></td><td>{{ item.customerCategoryName }}</td><td>1</td><td>{{ item.productName }}<small class="block mono">{{ item.productCode }}</small></td><td><strong>{{ labels[item.type] }}</strong></td><td>{{ item.startsAt.slice(0,16).replace('T',' ') }} ～ {{ item.endsAt ? item.endsAt.slice(0,16).replace('T',' ') : '永久' }}</td><td>{{ item.note || '—' }}</td><td><button v-if="canWrite" class="link" @click="edit(item)">编辑</button><button v-if="canWrite" class="link danger" @click="remove(item.id)">删除</button><span v-else>只读</span></td></tr></tbody></table></div>
  </section>
</template>
<style scoped>@import './authorization-views.css';.special-form{margin:12px 0}.special-form h2{font-size:16px}.special-form small{color:var(--color-muted);font-weight:400}.block{display:block;margin-top:3px;color:var(--color-muted)}</style>
