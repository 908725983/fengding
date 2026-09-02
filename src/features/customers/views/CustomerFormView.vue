<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, toRaw } from "vue";
import { storeToRefs } from "pinia";
import {
  onBeforeRouteLeave,
  RouterLink,
  useRoute,
  useRouter,
} from "vue-router";
import { validateCustomerDraft } from "../schemas/customer-schema";
import {
  applyCategoryToDraft,
  changeSettlementMethod,
  createEmptyCustomerDraft,
} from "../services/customer-service";
import { useCustomerStore } from "../runtime/customer-store";
import type { Customer, CustomerDraft, SettlementMethod } from "../types";
import ChinaRegionSelects from "../../../shared/components/ChinaRegionSelects.vue";

const route = useRoute();
const router = useRouter();
const store = useCustomerStore();
const { categories, tags, selectedCustomer, loading, actor } =
  storeToRefs(store);
const isEdit = computed(() => Boolean(route.params.customerId));
const draft = reactive<CustomerDraft>(createEmptyCustomerDraft());
const errors = reactive<Record<string, string>>({});
const saveError = ref<string | null>(null);
const saving = ref(false);
const committed = ref(false);
const initialSnapshot = ref("");
const dirty = computed(
  () =>
    initialSnapshot.value !== "" &&
    JSON.stringify(draft) !== initialSnapshot.value,
);

function customerToDraft(customer: Customer): CustomerDraft {
  const {
    id: _id,
    enterpriseId: _enterpriseId,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...fields
  } = toRaw(customer);
  return {
    ...structuredClone(fields),
    codeMode: "manual",
    code: customer.code,
  };
}

function setDraft(value: CustomerDraft): void {
  Object.assign(draft, structuredClone(value));
  initialSnapshot.value = JSON.stringify(draft);
  Object.keys(errors).forEach((key) => delete errors[key]);
  saveError.value = null;
}

function onCategoryChange(): void {
  const category = categories.value.find(
    (item) => item.id === draft.categoryId,
  );
  if (category) Object.assign(draft, applyCategoryToDraft(draft, category));
}

function onSettlementChange(): void {
  Object.assign(
    draft,
    changeSettlementMethod(draft, draft.settlementMethod as SettlementMethod),
  );
}

function fieldError(path: string): string | undefined {
  return errors[path];
}
function plainDraft(): CustomerDraft {
  return structuredClone(toRaw(draft));
}

function clearForm(): void {
  if (dirty.value && !window.confirm("当前内容尚未保存，确认清空表单吗？"))
    return;
  if (isEdit.value && selectedCustomer.value)
    setDraft(customerToDraft(selectedCustomer.value));
  else
    setDraft({
      ...createEmptyCustomerDraft(),
      salespersonId: actor.value.actorId,
    });
}

async function save(saveAndNew: boolean): Promise<void> {
  Object.keys(errors).forEach((key) => delete errors[key]);
  for (const issue of validateCustomerDraft(draft))
    if (!errors[issue.path]) errors[issue.path] = issue.message;
  if (Object.keys(errors).length) {
    document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    return;
  }
  saving.value = true;
  saveError.value = null;
  try {
    const saved = isEdit.value
      ? await store.updateCustomer(
          String(route.params.customerId),
          plainDraft(),
        )
      : await store.createCustomer(plainDraft());
    committed.value = true;
    if (saveAndNew) {
      if (isEdit.value) await router.push("/customers/new");
      setDraft({
        ...createEmptyCustomerDraft(),
        salespersonId: actor.value.actorId,
      });
      await nextTick();
      committed.value = false;
    } else await router.push(`/customers/${saved.id}`);
  } catch (caught) {
    saveError.value = caught instanceof Error ? caught.message : "客户保存失败";
  } finally {
    saving.value = false;
  }
}

onBeforeRouteLeave(() => {
  if (
    !committed.value &&
    dirty.value &&
    !window.confirm("存在未保存内容，确认离开吗？")
  )
    return false;
});

onMounted(async () => {
  if (isEdit.value) {
    await store.loadCustomer(String(route.params.customerId));
    if (selectedCustomer.value)
      setDraft(customerToDraft(selectedCustomer.value));
  } else {
    await store.load();
    setDraft({
      ...createEmptyCustomerDraft(),
      salespersonId: actor.value.actorId,
    });
  }
});
</script>

<template>
  <section class="form-page">
    <header class="form-header">
      <div>
        <RouterLink
          class="back-link"
          :to="isEdit ? `/customers/${route.params.customerId}` : '/customers'"
          >← 返回</RouterLink
        >
        <p class="eyebrow">CUS-001 · 客户档案</p>
        <h1>{{ isEdit ? "编辑客户" : "新增客户" }}</h1>
        <p>先填写客户和下单必需信息，其余资料可在客户详情补充。</p>
      </div>
      <div class="form-actions">
        <button class="button" type="button" @click="clearForm">清空表单</button
        ><button
          class="button"
          type="button"
          :disabled="saving"
          @click="save(true)"
        >
          保存并新增</button
        ><button
          class="button button--primary"
          type="button"
          :disabled="saving"
          @click="save(false)"
        >
          {{ saving ? "保存中…" : "保存" }}
        </button>
      </div>
    </header>
    <div v-if="loading" class="form-state">正在加载表单资料…</div>
    <p v-if="saveError" class="form-error" role="alert">{{ saveError }}</p>

    <form v-if="!loading" class="customer-form" @submit.prevent="save(false)">
      <main class="form-main">
        <section class="form-card">
          <h2>基本信息</h2>
          <div class="form-grid">
            <label
              ><span>客户编码 *</span
              ><input
                v-model="draft.code"
                :disabled="isEdit"
                placeholder="请输入唯一编码"
                :aria-invalid="Boolean(fieldError('code'))"
              /><em>{{ fieldError("code") }}</em></label
            >
            <label
              ><span>客户名称 *</span
              ><input
                v-model="draft.name"
                maxlength="50"
                :aria-invalid="Boolean(fieldError('name'))"
              /><em>{{ fieldError("name") }}</em></label
            >
            <label
              ><span>客户分类 *</span
              ><select
                v-model="draft.categoryId"
                data-test="category"
                :aria-invalid="Boolean(fieldError('categoryId'))"
                @change="onCategoryChange"
              >
                <option value="">请选择分类</option>
                <option
                  v-for="item in categories.filter(
                    (category) => category.status === 'active',
                  )"
                  :key="item.id"
                  :value="item.id"
                >
                  {{ item.name }}
                </option></select
              ><em>{{ fieldError("categoryId") }}</em></label
            >
            <label
              ><span>客户类型</span
              ><select v-model="draft.customerType">
                <option :value="null">请选择</option>
                <option value="enterprise">企业客户</option>
                <option value="individual">个人客户</option>
              </select></label
            >
          </div>
        </section>

        <section class="form-card">
          <h2>联系信息</h2>
          <div class="form-grid">
            <label
              ><span>联系人 *</span
              ><input
                v-model="draft.primaryContactName"
                :aria-invalid="Boolean(fieldError('primaryContactName'))"
              /><em>{{ fieldError("primaryContactName") }}</em></label
            >
            <label
              ><span>联系电话 *</span
              ><input
                v-model="draft.primaryPhone"
                :aria-invalid="Boolean(fieldError('primaryPhone'))"
              /><em>{{ fieldError("primaryPhone") }}</em></label
            >
            <ChinaRegionSelects
              v-model:province="draft.provinceCode"
              v-model:city="draft.cityCode"
            />
            <label class="form-wide"
              ><span>详细地址 *</span
              ><input
                v-model="draft.address"
                maxlength="100"
                :aria-invalid="Boolean(fieldError('address'))"
              /><small>填写街道、门牌号等具体收货地址，用于订单配送。</small
              ><em>{{ fieldError("address") }}</em></label
            >
            <label
              ><span>邮箱</span
              ><input
                v-model="draft.email"
                type="email"
                :aria-invalid="Boolean(fieldError('email'))"
              /><em>{{ fieldError("email") }}</em></label
            >
          </div>
        </section>

        <section class="form-card">
          <h2>财务信息</h2>
          <div class="form-grid">
            <label
              ><span>业务员</span
              ><select
                v-model="draft.salespersonId"
                :aria-invalid="Boolean(fieldError('salespersonId'))"
              >
                <option value="">暂不分配</option>
                <option value="staff-demo-1">演示业务员甲</option>
                <option value="staff-demo-2">演示业务员乙</option></select
              ><em>{{ fieldError("salespersonId") }}</em></label
            >
            <label
              ><span>信用额度（元）</span
              ><input
                :value="
                  draft.creditLimitCents === null
                    ? ''
                    : draft.creditLimitCents / 100
                "
                type="number"
                min="0"
                @input="
                  draft.creditLimitCents =
                    ($event.target as HTMLInputElement).value === ''
                      ? null
                      : Math.round(
                          Number(($event.target as HTMLInputElement).value) *
                            100,
                        )
                "
              /><small>允许客户赊账的最高金额；现结客户无需填写。</small></label
            >
            <label
              ><span>结算方式 *</span
              ><select
                v-model="draft.settlementMethod"
                data-test="settlement"
                @change="onSettlementChange"
              >
                <option value="cash">现结</option>
                <option value="monthly">月结</option>
                <option value="terms">账期结算</option>
              </select></label
            >
            <label
              ><span>账期（天）</span
              ><input
                v-model.number="draft.paymentTermDays"
                data-test="payment-term"
                type="number"
                min="1"
                max="365"
                :disabled="draft.settlementMethod !== 'terms'"
                :aria-invalid="Boolean(fieldError('paymentTermDays'))"
              /><em>{{ fieldError("paymentTermDays") }}</em></label
            >
            <p class="form-hint form-wide">
              收款方式、退款账户和开票资料在实际发生业务时填写，客户建档不强制录入。
            </p>
          </div>
        </section>

        <section class="form-card">
          <h2>补充资料（可选）</h2>
          <div class="form-grid">
            <label class="form-wide"
              ><span>客户简介</span
              ><textarea
                v-model="draft.description"
                maxlength="500"
                rows="3"
              ></textarea
              ><small>{{ draft.description?.length ?? 0 }}/500</small></label
            ><label class="form-wide"
              ><span>备注</span
              ><textarea v-model="draft.remark" rows="3"></textarea>
            </label>
          </div>
          <p class="scope-note">资质、附件和客户经营设置请在客户详情维护。</p>
        </section>
      </main>

      <aside class="form-aside">
        <section class="form-card">
          <h2>客户标签</h2>
          <label
            v-for="tag in tags.filter((item) => item.status === 'active')"
            :key="tag.id"
            class="tag-check"
            ><input v-model="draft.tagIds" type="checkbox" :value="tag.id" /><i
              :style="{ backgroundColor: tag.color }"
            ></i
            >{{ tag.name }}</label
          >
        </section>
      </aside>
    </form>
  </section>
</template>

<style scoped>
.form-page {
  max-width: 1500px;
  margin: 0 auto;
}
.form-header {
  display: flex;
  gap: 22px;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 16px;
}
.form-header h1 {
  margin: 3px 0;
}
.form-header p {
  margin-bottom: 0;
  color: var(--color-muted);
}
.back-link {
  color: var(--color-primary-strong);
  text-decoration: none;
}
.form-actions {
  display: flex;
  gap: 8px;
}
.button {
  min-height: 36px;
  padding: 0 14px;
  color: #4d5968;
  cursor: pointer;
  background: #fff;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-sm);
}
.button--primary {
  color: #fff;
  background: var(--color-primary);
  border-color: var(--color-primary);
}
.button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
.form-error {
  padding: 10px 12px;
  color: var(--color-danger);
  background: #fff0f0;
  border: 1px solid #efcaca;
}
.customer-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 14px;
}
.form-main,
.form-aside {
  display: grid;
  align-content: start;
  gap: 14px;
}
.form-card {
  padding: 18px;
  background: #fff;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}
.form-card h2 {
  margin-bottom: 16px;
  font-size: 16px;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px 18px;
}
.form-grid > label,
.map-field,
.upload-field {
  display: grid;
  align-content: start;
  gap: 5px;
  color: var(--color-muted);
  font-size: 12px;
}
.form-grid input,
.form-grid select,
.form-grid textarea {
  width: 100%;
  min-height: 36px;
  padding: 7px 9px;
  color: var(--color-text);
  background: #fff;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-sm);
}
.form-grid textarea {
  resize: vertical;
}
.form-grid [aria-invalid="true"] {
  border-color: var(--color-danger);
}
.form-grid em {
  min-height: 14px;
  color: var(--color-danger);
  font-size: 11px;
  font-style: normal;
}
.form-grid small,
.map-field small,
.upload-field small {
  color: #8993a1;
}
.form-wide {
  grid-column: 1 / -1;
}
.form-grid fieldset {
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
}
.form-grid legend {
  padding: 0 5px;
  color: var(--color-muted);
  font-size: 12px;
}
.check-inline {
  display: inline-flex;
  gap: 5px;
  align-items: center;
  margin-right: 18px;
  color: var(--color-text);
}
.check-inline input {
  width: auto;
  min-height: auto;
}
.tag-check,
.switch-row {
  display: flex;
  gap: 8px;
  align-items: center;
  min-height: 34px;
}
.tag-check i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.simulation-note {
  margin: 10px 0 0;
  color: var(--color-warning);
  font-size: 12px;
}
.scope-note {
  margin: 14px 0 0;
  padding-top: 12px;
  color: var(--color-muted);
  font-size: 12px;
  border-top: 1px dashed var(--color-border);
}
.form-summary ul {
  padding-left: 18px;
  margin: 0;
  color: var(--color-muted);
  font-size: 12px;
}
.form-summary li + li {
  margin-top: 6px;
}
.form-state {
  display: grid;
  min-height: 300px;
  place-items: center;
  background: #fff;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}
@media (max-width: 1100px) {
  .customer-form {
    grid-template-columns: 1fr;
  }
  .form-aside {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .form-header {
    align-items: flex-start;
    flex-direction: column;
  }
  .form-actions {
    flex-wrap: wrap;
  }
}
@media (max-width: 640px) {
  .form-grid,
  .form-aside {
    grid-template-columns: 1fr;
  }
  .form-wide {
    grid-column: auto;
  }
  .form-actions {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    width: 100%;
  }
  .form-actions .button {
    padding: 0 8px;
  }
}
</style>
