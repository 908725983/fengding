<script setup lang="ts">
import { computed, onMounted, reactive, ref, toRaw } from "vue";
import { storeToRefs } from "pinia";
import {
  onBeforeRouteLeave,
  RouterLink,
  useRoute,
  useRouter,
} from "vue-router";
import { useProcurementStore } from "../runtime/procurement-store";
import { createEmptySupplierDraft } from "../services/procurement-service";
import { validateSupplierDraft } from "../schemas/procurement-schema";
import type { SupplierDraft } from "../types";
import ChinaRegionSelects from "../../../shared/components/ChinaRegionSelects.vue";
import "./procurement-views.css";
const store = useProcurementStore(),
  route = useRoute(),
  router = useRouter();
const { selectedSupplier, loading, saving, actor } = storeToRefs(store);
const supplierProvince = ref("");
const supplierCity = ref("");
const supplierAddressDetail = ref("");
const isEdit = computed(() => Boolean(route.params.id)),
  draft = reactive<SupplierDraft>(createEmptySupplierDraft()),
  errors = reactive<Record<string, string>>({}),
  saveError = ref<string | null>(null),
  initial = ref(""),
  committed = ref(false),
  dirty = computed(
    () => initial.value !== "" && JSON.stringify(draft) !== initial.value,
  );
function setDraft(value: SupplierDraft) {
  Object.assign(draft, structuredClone(value));
  supplierAddressDetail.value = value.address ?? "";
  initial.value = JSON.stringify(draft);
}
function fromSelected(): SupplierDraft {
  const value = selectedSupplier.value!;
  return {
    code: value.code,
    name: value.name,
    tradeType: value.tradeType,
    deliveryMode: value.deliveryMode,
    contactName: value.contactName,
    contactPhone: value.contactPhone,
    address: value.address,
    bankName: value.bankName,
    bankAccount: value.bankAccount,
    note: value.note,
  };
}
async function save() {
  draft.address = `${supplierProvince.value}${supplierCity.value}${supplierAddressDetail.value ? ` ${supplierAddressDetail.value}` : ""}`;
  Object.keys(errors).forEach((key) => delete errors[key]);
  for (const issue of validateSupplierDraft(draft))
    if (!(issue.path === "code" && !isEdit.value) && !errors[issue.path])
      errors[issue.path] = issue.message;
  if (Object.keys(errors).length) return;
  try {
    const saved = await store.saveSupplier(
      structuredClone(toRaw(draft)),
      isEdit.value ? (selectedSupplier.value ?? undefined) : undefined,
    );
    committed.value = true;
    await router.push(`/procurement/suppliers/${saved.id}`);
  } catch (caught) {
    saveError.value =
      caught instanceof Error ? caught.message : "供应商保存失败";
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
    await store.loadSupplier(String(route.params.id));
    if (selectedSupplier.value) setDraft(fromSelected());
  } else setDraft(createEmptySupplierDraft());
});
</script>
<template>
  <section class="procurement-page">
    <header class="procurement-header">
      <div>
        <RouterLink to="/procurement/suppliers">← 返回供应商</RouterLink>
        <h1>{{ isEdit ? "编辑供应商" : "新增供应商" }}</h1>
        <p>供应商编码由系统自动生成；开户行与银行账号必须同时填写或同时为空。</p>
      </div>
    </header>
    <div v-if="loading" class="procurement-state">正在加载表单…</div>
    <form v-else class="procurement-form" @submit.prevent="save">
      <label class="wide"
        >供应商名称 *<input
          v-model="draft.name"
          maxlength="80"
          :aria-invalid="Boolean(errors.name)"
        /><em>{{ errors.name }}</em></label
      ><label
        >交易类型 *<select v-model="draft.tradeType">
          <option value="purchase">购销</option>
          <option value="resale">代销</option>
        </select></label
      ><label
        >供货方式 *<select v-model="draft.deliveryMode">
          <option value="warehouse">入仓</option>
          <option value="direct">直送</option>
          <option value="both">均可</option>
        </select></label
      ><label
        >联系人 *<input
          v-model="draft.contactName"
          maxlength="40"
          :aria-invalid="Boolean(errors.contactName)"
        /><em>{{ errors.contactName }}</em></label
      ><label
        >联系电话 *<input
          v-model="draft.contactPhone"
          maxlength="30"
          :aria-invalid="Boolean(errors.contactPhone)"
        /><em>{{ errors.contactPhone }}</em></label
      ><div class="procurement-region-fields wide">
        <ChinaRegionSelects
          v-model:province="supplierProvince"
          v-model:city="supplierCity"
          province-label="所在省"
          city-label="所在市"
        />
      </div><label class="wide"
        >详细地址<textarea
          v-model="supplierAddressDetail"
          maxlength="160"
          rows="2"
        ></textarea></label
      ><label
        >开户行<input
          v-model="draft.bankName"
          :disabled="actor.role === 'warehouse' && isEdit"
          maxlength="80" /></label
      ><label
        >银行账号<input
          v-model="draft.bankAccount"
          :disabled="actor.role === 'warehouse' && isEdit"
          maxlength="50"
        /><em>{{ errors["bankName/bankAccount"] }}</em></label
      ><label class="wide"
        >备注<textarea v-model="draft.note" maxlength="500" rows="3"></textarea>
      </label>
      <p
        v-if="actor.role === 'warehouse' && isEdit"
        class="procurement-warning wide"
      >
        仓库角色只显示银行账号尾号；编辑其他资料时原银行资料保持不变。
      </p>
      <p v-if="saveError" class="procurement-warning wide" role="alert">
        {{ saveError }}
      </p>
      <div class="procurement-actions">
        <RouterLink class="pur-button" to="/procurement/suppliers"
          >取消</RouterLink
        ><button class="pur-button primary" :disabled="saving" type="submit">
          {{ saving ? "保存中…" : "保存" }}
        </button>
      </div>
    </form>
  </section>
</template>
