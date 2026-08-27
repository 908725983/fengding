<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { RouterLink } from 'vue-router'
import { useProductStore, type ProductRuntimeScenario } from '../runtime/product-store'
import type { ProductReferenceDraft, ProductReferenceKind } from '../types'

const props = defineProps<{ kind: ProductReferenceKind }>()
const store = useProductStore()
const { referenceRows, loading, saving, error, scenario, canWrite } = storeToRefs(store)
const editingId = ref<string>()
const formVisible = ref(false)
const formError = ref('')
const statusFilter = ref<'all' | 'active' | 'inactive'>('all')
const categoryInline = reactive({ visible: false, mode: 'add' as 'add' | 'edit', id: '', parentId: null as string | null, name: '', sortOrder: 0 })
const form = reactive<ProductReferenceDraft>({ name: '', parentId: null, sortOrder: 0, status: 'active', type: 'auxiliary', conversionRate: 1, color: '#5B8FF9', aiAllowed: false })
const titles: Record<string, string> = { categories: '商品分类', brands: '商品品牌', units: '商品单位', tags: '商品标签' }
const title = computed(() => titles[props.kind] ?? '商品辅助资料')
const kind = computed(() => props.kind)
const isCategory = computed(() => props.kind === 'categories')
const filteredRows = computed(() => statusFilter.value === 'all' ? referenceRows.value : referenceRows.value.filter((row) => row.status === statusFilter.value))

type CategoryRow = { row: Record<string, unknown>; depth: number; hasChildren: boolean }
const categoryRows = computed<CategoryRow[]>(() => {
  if (!isCategory.value) return []
  const rows = referenceRows.value
  const children = (parentId: string | null, depth: number): CategoryRow[] => rows
    .filter((row) => (row.parentId ? String(row.parentId) : null) === parentId)
    .sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0) || String(a.name).localeCompare(String(b.name)))
    .flatMap((row) => {
      const id = String(row.id)
      const hasChildren = rows.some((child) => String(child.parentId ?? '') === id)
      return [{ row, depth, hasChildren }, ...children(id, depth + 1)]
    })
  return children(null, 0)
})

function resetForm(): void {
  editingId.value = undefined
  formVisible.value = false
  Object.assign(form, { name: '', parentId: null, sortOrder: 0, status: 'active', type: props.kind === 'units' ? 'auxiliary' : undefined, conversionRate: 1, color: '#5B8FF9', aiAllowed: false })
}

function openCreate(): void {
  if (isCategory.value) { categoryInline.visible = true; categoryInline.mode = 'add'; categoryInline.id = ''; categoryInline.parentId = null; categoryInline.name = ''; categoryInline.sortOrder = 0; return }
  editingId.value = undefined
  Object.assign(form, { name: '', parentId: null, sortOrder: 0, status: 'active', type: props.kind === 'units' ? 'auxiliary' : undefined, conversionRate: 1, color: '#5B8FF9', aiAllowed: false })
  formVisible.value = true
}

function openCreateChild(parentId: string): void {
  categoryInline.visible = true; categoryInline.mode = 'add'; categoryInline.id = ''; categoryInline.parentId = parentId; categoryInline.name = ''; categoryInline.sortOrder = 0
}

function edit(row: Record<string, unknown>): void {
  if (isCategory.value) {
    categoryInline.visible = true; categoryInline.mode = 'edit'; categoryInline.id = String(row.id); categoryInline.parentId = row.parentId ? String(row.parentId) : null; categoryInline.name = String(row.name ?? ''); categoryInline.sortOrder = Number(row.sortOrder ?? 0); return
  }
  editingId.value = String(row.id)
  Object.assign(form, { name: String(row.name ?? ''), parentId: null, sortOrder: Number(row.sortOrder ?? 0), status: row.status === 'inactive' ? 'inactive' : 'active', type: row.type === 'basic' ? 'basic' : 'auxiliary', conversionRate: Number(row.conversionRate ?? 1), color: String(row.color ?? '#5B8FF9'), aiAllowed: Boolean(row.aiAllowed) })
  formVisible.value = true
}

async function saveCategoryInline(): Promise<void> {
  formError.value = ''
  try {
    await store.saveReference('categories', { name: categoryInline.name, parentId: categoryInline.parentId, sortOrder: categoryInline.sortOrder }, categoryInline.mode === 'edit' ? categoryInline.id : undefined)
    categoryInline.visible = false
  } catch (caught) { formError.value = caught instanceof Error ? caught.message : '保存失败' }
}

async function submit(): Promise<void> {
  formError.value = ''
  try { await store.saveReference(props.kind, { ...form, parentId: form.parentId || null }, editingId.value); resetForm() }
  catch (caught) { formError.value = caught instanceof Error ? caught.message : '保存失败' }
}

async function remove(row: Record<string, unknown>): Promise<void> {
  try { await store.deleteReference(props.kind, String(row.id)) }
  catch (caught) { formError.value = caught instanceof Error ? caught.message : '删除失败' }
}

async function toggle(row: Record<string, unknown>): Promise<void> {
  try { await store.setReferenceStatus(props.kind, String(row.id), row.status === 'active' ? 'inactive' : 'active') }
  catch (caught) { formError.value = caught instanceof Error ? caught.message : '状态更新失败' }
}

async function retry(): Promise<void> { await store.loadReferenceRecords(props.kind) }
async function switchScenario(event: Event): Promise<void> { await store.setScenario((event.target as HTMLSelectElement).value as ProductRuntimeScenario) }
onMounted(() => retry())
watch(() => props.kind, () => {
  resetForm()
  categoryInline.visible = false
  statusFilter.value = 'all'
  void retry()
})
</script>

<template>
  <section class="product-reference-page">
    <header class="product-header"><div><p class="eyebrow">PRD-005 · 商品辅助资料</p><h1>{{ title }}</h1><p>维护商品表单和订单、库存流程使用的基础资料。</p></div><div class="header-actions"><label class="scenario"><span>场景</span><select :value="scenario" @change="switchScenario"><option value="normal">正常</option><option value="empty">空数据</option><option value="error">服务错误</option><option value="slow">慢响应</option><option value="permission-denied">无权限</option></select></label></div></header>
    <nav class="product-reference-nav"><RouterLink to="/products/references/categories">分类</RouterLink><RouterLink to="/products/references/brands">品牌</RouterLink><RouterLink to="/products/references/units">单位</RouterLink><RouterLink to="/products/references/tags">标签</RouterLink></nav>
    <div v-if="error || formError" class="reference-warning" role="alert">{{ error || formError }} <button type="button" @click="retry">重试</button></div>

    <template v-if="isCategory">
      <div class="reference-panel category-panel"><div class="reference-toolbar"><strong>商品分类</strong><button class="reference-button primary" :disabled="!canWrite" @click="openCreate">新增</button></div>
        <div v-if="loading" class="reference-state">正在加载商品分类…</div><div v-else-if="!categoryRows.length && !categoryInline.visible" class="reference-state">暂无商品分类，管理员可新增</div>
        <table v-else class="reference-table category-table"><thead><tr><th>分类名称</th><th>状态</th><th>操作</th></tr></thead><tbody>
          <template v-if="categoryInline.visible && categoryInline.mode === 'add' && categoryInline.parentId === null"><tr class="category-edit-row"><td colspan="3"><span class="tree-indent">└</span><input v-model.trim="categoryInline.name" placeholder="请输入分类名称" autofocus><button class="reference-button primary" :disabled="!categoryInline.name || saving" @click="saveCategoryInline">确定</button><button class="reference-button" @click="categoryInline.visible = false">取消</button></td></tr></template>
          <template v-for="item in categoryRows" :key="String(item.row.id)">
            <tr v-if="categoryInline.visible && categoryInline.mode === 'edit' && categoryInline.id === String(item.row.id)" class="category-edit-row"><td><span class="tree-indent" :style="{ paddingLeft: `${item.depth * 28}px` }"><span class="folder">▱</span><input v-model.trim="categoryInline.name" placeholder="请输入分类名称" autofocus></span></td><td>{{ item.row.status === 'active' ? '启用' : '停用' }}</td><td><button class="reference-button primary" :disabled="!categoryInline.name || saving" @click="saveCategoryInline">确定</button><button class="reference-button" @click="categoryInline.visible = false">取消</button></td></tr>
            <tr v-else :class="{ 'category-active': categoryInline.id === String(item.row.id) }"><td><span class="tree-indent" :style="{ paddingLeft: `${item.depth * 28}px` }">{{ item.hasChildren ? '▾' : '·' }} <span class="folder">▱</span> {{ item.row.name }}</span></td><td>{{ item.row.status === 'active' ? '启用' : '停用' }}</td><td><button class="reference-button" :disabled="!canWrite" @click="openCreateChild(String(item.row.id))">新增子分类</button><button class="reference-button" @click="edit(item.row)">修改</button><button class="reference-button" :disabled="!canWrite" @click="toggle(item.row)">{{ item.row.status === 'active' ? '停用' : '启用' }}</button><button class="reference-button danger" :disabled="!canWrite" @click="remove(item.row)">删除</button></td></tr>
            <tr v-if="categoryInline.visible && categoryInline.mode === 'add' && categoryInline.parentId === String(item.row.id)" class="category-edit-row"><td colspan="3"><span class="tree-indent" :style="{ paddingLeft: `${(item.depth + 1) * 28}px` }">└</span><input v-model.trim="categoryInline.name" placeholder="请输入子分类名称" autofocus><button class="reference-button primary" :disabled="!categoryInline.name || saving" @click="saveCategoryInline">确定</button><button class="reference-button" @click="categoryInline.visible = false">取消</button></td></tr>
          </template>
        </tbody></table>
      </div>
    </template>

    <template v-else>
      <div class="reference-panel simple-panel"><div class="reference-toolbar"><strong>{{ title }}列表</strong><div class="toolbar-actions"><select v-if="kind === 'tags'" v-model="statusFilter" aria-label="标签状态筛选"><option value="all">全部</option><option value="active">启用</option><option value="inactive">停用</option></select><button class="reference-button primary" :disabled="!canWrite" @click="openCreate">新增</button></div></div>
        <div v-if="loading" class="reference-state">正在加载{{ title }}…</div><div v-else-if="!filteredRows.length" class="reference-state">暂无{{ title }}，管理员可新增</div>
        <table v-else class="reference-table simple-table"><thead><tr><th>名称</th><th v-if="kind === 'units'">类型 / 换算率</th><th v-if="kind === 'tags'">标签属性</th><th>操作</th></tr></thead><tbody><tr v-for="row in filteredRows" :key="String(row.id)"><td>{{ row.name }}</td><td v-if="kind === 'units'">{{ row.type === 'basic' ? '基本' : '辅助' }} / {{ row.conversionRate ?? 1 }}</td><td v-if="kind === 'tags'"><span class="tag-swatch" :style="{ background: String(row.color || '#5B8FF9') }"></span>{{ row.aiAllowed ? '允许 AI' : '普通标签' }}</td><td><button class="reference-button" @click="edit(row)">修改</button><button class="reference-button" :disabled="!canWrite" @click="toggle(row)">{{ row.status === 'active' ? '停用' : '启用' }}</button><button class="reference-button danger" :disabled="!canWrite" @click="remove(row)">删除</button></td></tr></tbody></table>
      </div>
      <form v-if="formVisible" class="reference-panel reference-form" @submit.prevent="submit"><h2>{{ editingId ? '编辑' : '新增' }}{{ title }}</h2><label>名称<input v-model.trim="form.name" required autofocus></label><label v-if="kind === 'units'">单位类型<select v-model="form.type"><option value="basic">基本单位</option><option value="auxiliary">辅助单位</option></select></label><label v-if="kind === 'units'">换算率<input v-model.number="form.conversionRate" type="number" min="0.000001" step="0.000001"></label><label v-if="kind === 'tags'">标签颜色<input v-model="form.color" type="color"></label><label v-if="kind === 'tags'" class="reference-check"><input v-model="form.aiAllowed" type="checkbox">允许 AI 使用</label><div class="reference-actions"><button type="button" class="reference-button" @click="resetForm">取消</button><button class="reference-button primary" :disabled="saving || !canWrite">保存</button></div></form>
    </template>
  </section>
</template>

<style scoped>
.product-reference-page{max-width:1680px;margin:0 auto}.product-reference-nav{display:flex;gap:22px;overflow:auto;min-height:44px;padding:0 16px;background:#fff;border:1px solid var(--color-border);border-radius:6px}.product-reference-nav a{display:flex;align-items:center;white-space:nowrap;color:var(--color-muted);text-decoration:none}.product-reference-nav a.router-link-active{color:var(--color-primary-strong);font-weight:700;border-bottom:2px solid var(--color-primary)}.reference-panel{padding:16px;background:#fff;border:1px solid var(--color-border);border-radius:6px;margin-top:12px}.reference-toolbar{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px}.toolbar-actions{display:flex;gap:8px;align-items:center}.reference-table{width:100%;border-collapse:collapse;font-size:13px}.reference-table th,.reference-table td{padding:10px;border-bottom:1px solid var(--color-border);text-align:left;white-space:nowrap}.reference-table th{color:var(--color-muted);font-size:12px}.reference-table tbody tr:hover{background:#eefafa}.reference-button{min-height:32px;padding:0 10px;color:var(--color-text);background:#fff;border:1px solid var(--color-border-strong);border-radius:4px;cursor:pointer}.reference-button+.reference-button{margin-left:6px}.reference-button.primary{color:#fff;background:var(--color-primary);border-color:var(--color-primary)}.reference-button.danger{color:var(--color-danger)}.reference-button:disabled{opacity:.5;cursor:not-allowed}.reference-state{padding:36px;text-align:center;color:var(--color-muted)}.reference-warning{margin-top:12px;padding:10px;color:var(--color-danger);background:#fff0ee;border:1px solid #f0c0ba}.reference-warning button{margin-left:8px}.reference-form{display:grid;gap:12px;align-content:start}.reference-form h2{margin:0;font-size:16px}.reference-form label{display:grid;gap:5px;color:var(--color-muted);font-size:12px}.reference-form input,.reference-form select{min-height:34px;padding:6px 8px;border:1px solid var(--color-border-strong);border-radius:4px}.reference-check{display:flex!important;align-items:center;gap:8px}.reference-actions{display:flex;justify-content:flex-end;gap:8px}.tag-swatch{display:inline-block;width:14px;height:14px;margin-right:6px;vertical-align:-2px;border:1px solid #ddd;border-radius:50%}.category-panel{overflow:auto}.category-table{min-width:760px}.category-edit-row{background:#f1f8fc}.category-edit-row td{padding:8px}.category-edit-row input{min-width:240px;margin:0 8px;padding:7px;border:1px solid var(--color-border-strong);border-radius:4px}.category-edit-row .inline-sort{min-width:70px;width:70px}.tree-indent{display:inline-flex;align-items:center;min-width:200px}.folder{color:#57878d}@media(max-width:650px){.product-reference-nav{gap:14px}.reference-panel{overflow:auto}.simple-table{min-width:560px}}
</style>
