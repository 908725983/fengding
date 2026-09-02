<script setup lang="ts">
import { computed } from "vue";
import { chinaProvinces, citiesForProvince } from "../data/china-regions";

const props = withDefaults(
  defineProps<{
    province: string | null | undefined;
    city: string | null | undefined;
    provinceLabel?: string;
    cityLabel?: string;
    required?: boolean;
  }>(),
  { provinceLabel: "省", cityLabel: "市", required: true },
);
const emit = defineEmits<{
  "update:province": [value: string];
  "update:city": [value: string];
}>();
const provinceOptions = chinaProvinces;
const cityOptions = computed(() => citiesForProvince(props.province));
const legacyProvince = computed(() =>
  props.province &&
  !provinceOptions.some((item) => item.name === props.province)
    ? props.province
    : "",
);
const legacyCity = computed(() =>
  props.city && !cityOptions.value.includes(props.city) ? props.city : "",
);

function setProvince(value: string): void {
  emit("update:province", value);
  if (value && !citiesForProvince(value).includes(props.city ?? ""))
    emit("update:city", "");
}
</script>

<template>
  <label class="region-select-field">
    <span>{{ props.provinceLabel }}<b v-if="props.required"> *</b></span>
    <select
      :value="props.province ?? ''"
      :required="props.required"
      @change="setProvince(($event.target as HTMLSelectElement).value)"
    >
      <option value="">请选择{{ props.provinceLabel }}</option>
      <option v-if="legacyProvince" :value="legacyProvince">
        {{ legacyProvince }}（历史数据）
      </option>
      <option
        v-for="item in provinceOptions"
        :key="item.code"
        :value="item.name"
      >
        {{ item.name }}
      </option>
    </select>
  </label>
  <label class="region-select-field">
    <span>{{ props.cityLabel }}<b v-if="props.required"> *</b></span>
    <select
      :value="props.city ?? ''"
      :required="props.required"
      :disabled="!props.province"
      @change="emit('update:city', ($event.target as HTMLSelectElement).value)"
    >
      <option value="">
        {{
          props.province
            ? `请选择${props.cityLabel}`
            : `请先选择${props.provinceLabel}`
        }}
      </option>
      <option v-if="legacyCity" :value="legacyCity">
        {{ legacyCity }}（历史数据）
      </option>
      <option v-for="item in cityOptions" :key="item" :value="item">
        {{ item }}
      </option>
    </select>
  </label>
</template>

<style scoped>
.region-select-field {
  display: grid;
  gap: 5px;
  color: var(--color-muted);
  font-size: 12px;
}
.region-select-field b {
  color: var(--color-danger);
  font-weight: 400;
}
.region-select-field select {
  width: 100%;
  min-height: 36px;
  padding: 7px 9px;
  color: var(--color-text);
  background: #fff;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-sm);
  max-height: 240px;
}
.region-select-field select:disabled {
  background: #f5f7fa;
  cursor: not-allowed;
}
</style>
