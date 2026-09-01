<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { useRoute, useRouter } from "vue-router";
import ProcurementScenarioBar from "../components/ProcurementScenarioBar.vue";
import ProcurementSubnav from "../components/ProcurementSubnav.vue";
import { useReplenishmentStore } from "../runtime/replenishment-store";
import type { ReplenishmentMode, ReplenishmentRow } from "../types";
import "./procurement-views.css";
import "./replenishment.css";

const store = useReplenishmentStore();
const route = useRoute();
const router = useRouter();
const { result, loading, error, mode, scenario, actor, saving } =
  storeToRefs(store);
const categoryId = ref(String(route.query.categoryId ?? ""));
const warehouseId = ref(String(route.query.warehouseId ?? ""));
const keyword = ref(String(route.query.keyword ?? ""));
const selected = ref<string[]>([]);
const rows = computed(() => result.value.rows);
const categories = computed(() => [
  ...new Map(
    rows.value
      .filter((row) => row.categoryId)
      .map((row) => [row.categoryId!, row.categoryId!]),
  ).values(),
]);
const warehouses = computed(() => [
  ...new Map(
    rows.value.map((row) => [row.warehouseId, row.warehouseName]),
  ).entries(),
]);
const isSelected = (row: ReplenishmentRow) => selected.value.includes(row.id);
function toggle(row: ReplenishmentRow) {
  selected.value = isSelected(row)
    ? selected.value.filter((id) => id !== row.id)
    : [...selected.value, row.id];
}
async function search() {
  await router.replace({
    query: {
      mode: mode.value,
      ...(categoryId.value && { categoryId: categoryId.value }),
      ...(warehouseId.value && { warehouseId: warehouseId.value }),
      ...(keyword.value && { keyword: keyword.value }),
    },
  });
  await store.load({
    categoryId: categoryId.value || undefined,
    warehouseId: warehouseId.value || undefined,
    keyword: keyword.value || undefined,
  });
}
function download() {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(
    new Blob([store.exportCsv()], { type: "text/csv;charset=utf-8" }),
  );
  link.download = "补货分析.csv";
  link.click();
  URL.revokeObjectURL(link.href);
}
function adjust(row: ReplenishmentRow) {
  const value = window.prompt(
    "请输入采购单位数量",
    String(row.suggestedQuantity ?? 0),
  );
  if (value !== null) store.adjust(row, Number(value));
}
function createDraft() {
  const chosen = rows.value.filter((row) => selected.value.includes(row.id));
  const draft = store.createDraft(chosen);
  window.alert(`已生成候选草稿 ${draft.id}，未创建采购单`);
}
onMounted(() =>
  store.load({
    categoryId: categoryId.value || undefined,
    warehouseId: warehouseId.value || undefined,
    keyword: keyword.value || undefined,
  }),
);
</script>
<template>
  <section class="procurement-page">
    <header class="procurement-header">
      <div>
        <h1>补货分析</h1>
        <p>按仓库与 SKU 生成可解释的补货候选；跨域事实缺失时显示不可用。</p>
      </div>
      <ProcurementScenarioBar
        :scenario="scenario"
        :role="actor.role"
        @scenario="store.setScenario"
        @role="store.setRole"
      />
    </header>
    <ProcurementSubnav />
    <nav class="replenishment-tabs" aria-label="补货分析方式">
      <button
        v-for="item in [
          ['safety', '按安全库存'],
          ['shortage', '按缺货'],
          ['combined', '安全库存与缺货'],
        ] as const"
        :key="item[0]"
        :class="{ active: mode === item[0] }"
        @click="store.setMode(item[0])"
      >
        {{ item[1] }}
      </button>
    </nav>
    <form class="procurement-toolbar" @submit.prevent="search">
      <label class="grow"
        >商品 / SKU / 仓库<input
          v-model="keyword"
          type="search"
          placeholder="输入名称、编码或仓库" /></label
      ><label
        >商品分类<select v-model="categoryId">
          <option value="">全部分类</option>
          <option
            v-for="category in categories"
            :key="category"
            :value="category"
          >
            {{ category }}
          </option>
        </select></label
      ><label
        >仓库<select v-model="warehouseId">
          <option value="">全部仓库</option>
          <option v-for="item in warehouses" :key="item[0]" :value="item[0]">
            {{ item[1] }}
          </option>
        </select></label
      ><button class="pur-button primary" type="submit">查询</button
      ><button class="pur-button" type="button" @click="download">导出</button
      ><button
        class="pur-button"
        type="button"
        :disabled="!selected.length || !store.canWrite()"
        @click="createDraft"
      >
        交接候选
      </button>
    </form>
    <div class="procurement-summary">
      <article>
        <span>库存总数</span
        ><strong>{{ result.summary.inventoryTotal ?? "不可用" }}</strong>
      </article>
      <article>
        <span>缺货总数</span
        ><strong>{{ result.summary.shortageTotal ?? "不可用" }}</strong>
      </article>
      <article>
        <span>建议补货数</span
        ><strong>{{ result.summary.suggestedTotal ?? "不可用" }}</strong>
      </article>
      <article :title="result.version">
        <span>分析版本</span
        ><strong class="replenishment-version">{{
          result.version.startsWith("inventory:")
            ? "当前库存快照"
            : result.version
        }}</strong>
      </article>
    </div>
    <div v-if="error" class="procurement-state error" role="alert">
      {{ error }} <button class="pur-button" @click="search">重试</button>
    </div>
    <div v-else-if="loading" class="procurement-state">正在加载补货分析…</div>
    <div v-else-if="!rows.length" class="procurement-state">
      <strong>暂无分析结果</strong
      ><span>当前筛选没有候选，或上游 provider 尚未接入。</span>
    </div>
    <div v-else class="procurement-table-wrap">
      <table class="procurement-table replenishment-table">
        <thead>
          <tr>
            <th>选择</th>
            <th>仓库</th>
            <th>商品 / SKU</th>
            <th>单位</th>
            <th>库存</th>
            <th>缺货</th>
            <th>安全下限 / 上限</th>
            <th>建议补货</th>
            <th>供应价</th>
            <th>预估金额</th>
            <th>来源 / 状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id">
            <td>
              <input
                type="checkbox"
                :checked="isSelected(row)"
                :disabled="row.availability === 'unavailable'"
                @change="toggle(row)"
              />
            </td>
            <td>
              {{ row.warehouseName }}<small>{{ row.warehouseCode }}</small>
            </td>
            <td>
              <strong>{{ row.productName }}</strong
              ><small>{{ row.skuCode }} {{ row.specification }}</small>
            </td>
            <td>{{ row.unitName || "不可用" }}</td>
            <td>{{ row.currentQuantity ?? "不可用" }}</td>
            <td>{{ row.shortageQuantity ?? "不可用" }}</td>
            <td>
              {{ row.safetyMinimumQuantity ?? "不可用" }} /
              {{ row.maximumQuantity ?? "不可用" }}
            </td>
            <td>
              {{ row.suggestedQuantity ?? "不可用"
              }}<small v-if="row.quantitySource === 'manual'">手工调整</small>
            </td>
            <td class="pur-money">
              {{
                row.supplyPriceCents === null
                  ? row.priceState === "manual-required"
                    ? "需人工选择"
                    : "不可用"
                  : `¥${(row.supplyPriceCents / 100).toFixed(2)}`
              }}
            </td>
            <td class="pur-money">
              {{
                row.estimatedAmountCents === null
                  ? "不可用"
                  : `¥${(row.estimatedAmountCents / 100).toFixed(2)}`
              }}
            </td>
            <td>
              <span class="pur-status" :class="row.availability">{{
                row.availability === "available"
                  ? row.suggestionSource.join("+") || "无建议"
                  : row.unavailableReason || "不可用"
              }}</span>
            </td>
            <td>
              <button
                class="pur-button"
                :disabled="
                  !store.canWrite() ||
                  row.availability === 'unavailable' ||
                  saving
                "
                @click="adjust(row)"
              >
                调整
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
