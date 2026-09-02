<script setup lang="ts">
import { onMounted, reactive, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useSettingsStore } from "../runtime/settings-store";
import SettingsSubnav from "../components/SettingsSubnav.vue";
import SettingsScenarioBar from "../components/SettingsScenarioBar.vue";
import type { CompanyDraft } from "../types";
import ChinaRegionSelects from "../../../shared/components/ChinaRegionSelects.vue";
import { chinaProvinces, citiesForProvince } from "../../../shared/data/china-regions";
import "./settings-views.css";
const store = useSettingsStore();
const { company, loading, error, saving, scenario, actor } = storeToRefs(store);
const form = reactive<CompanyDraft>({
  name: "",
  code: "",
  contactName: "",
  phone: "",
  email: null,
  region: null,
  address: null,
  logo: null,
  description: null,
});
const formError = ref("");
const companyProvince = ref("");
const companyCity = ref("");
watch(
  company,
  (value) => {
    if (value)
      Object.assign(form, {
        name: value.name,
        code: value.code,
        contactName: value.contactName,
        phone: value.phone,
        email: value.email,
        region: value.region,
        address: value.address,
        logo: value.logo,
        description: value.description,
      });
    if (value?.region) {
      const province = chinaProvinces.find((item) => value.region.startsWith(item.name));
      companyProvince.value = province?.name ?? "";
      companyCity.value = province ? citiesForProvince(province.name).find((item) => value.region.includes(item)) ?? "" : "";
    }
  },
  { immediate: true },
);
onMounted(() => store.load());
async function submit() {
  formError.value = "";
  try {
    form.region = `${companyProvince.value}${companyCity.value}`;
    await store.saveCompany({ ...form });
  } catch (e) {
    formError.value = e instanceof Error ? e.message : "保存失败";
  }
}
</script>
<template>
  <section class="settings-page">
    <header class="settings-header">
      <div>
        <p class="eyebrow">SET-001 · 企业资料</p>
        <h1>公司信息</h1>
        <p>企业唯一基础资料；Logo 仅保存原型文件元数据。</p>
      </div>
      <SettingsScenarioBar
        :scenario="scenario"
        :role="actor.role"
        @scenario="store.setScenario"
        @role="store.setRole"
      />
    </header>
    <SettingsSubnav />
    <div v-if="error || formError" class="settings-warning" role="alert">
      {{ error || formError }}
      <button class="set-button" @click="store.load">重试</button>
    </div>
    <div v-if="loading" class="settings-state">正在加载公司资料…</div>
    <form v-else class="settings-panel settings-form" @submit.prevent="submit">
      <label
        >公司名称<input
          v-model.trim="form.name"
          required
          maxlength="100" /></label
      ><label
        >公司编码<input
          v-model.trim="form.code"
          required
          maxlength="40" /></label
      ><label
        >联系人<input
          v-model.trim="form.contactName"
          required
          maxlength="40" /></label
      ><label
        >联系电话<input
          v-model.trim="form.phone"
          required
          maxlength="40" /></label
      ><label
        >邮箱<input
          v-model.trim="form.email"
          type="email"
          maxlength="120" /></label
      ><ChinaRegionSelects
        v-model:province="companyProvince"
        v-model:city="companyCity"
        province-label="所在省"
        city-label="所在市"
      /><label
        >详细地址<input
          v-model.trim="form.address"
          maxlength="200" /><small>填写公司实际办公或发货地址。</small></label
      ><label class="wide"
        >公司简介<textarea
          v-model.trim="form.description"
          maxlength="1000"
        ></textarea>
      </label>
      <div class="settings-actions">
        <button
          class="set-button primary"
          :disabled="saving || !store.canWrite"
        >
          {{ saving ? "保存中…" : "保存公司资料" }}
        </button>
      </div>
    </form>
  </section>
</template>
