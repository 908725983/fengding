<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { RouterLink } from "vue-router";
import InventorySubnav from "../components/InventorySubnav.vue";
import InventoryScenarioBar from "../components/InventoryScenarioBar.vue";
import { useInventoryStore } from "../runtime/inventory-store";
import "./inventory-views.css";
const store = useInventoryStore();
const { workspace, loading, error, scenario, actor, canWrite } =
  storeToRefs(store);
const keyword = ref("");
const rows = computed(() =>
  workspace.value.warehouses.filter(
    (x) =>
      !keyword.value ||
      [x.code, x.name, x.address].some((v) => v?.includes(keyword.value)),
  ),
);
onMounted(() => store.load());
</script>
<template>
  <section class="inventory-page">
    <header class="inventory-header">
      <div>
        <h1>仓库管理</h1>
        <p>库存领域持有唯一仓库实体；设置模块以后通过公开 provider 共用。</p>
      </div>
      <InventoryScenarioBar
        :scenario="scenario"
        :role="actor.role"
        @scenario="store.setScenario"
        @role="store.setRole"
      />
    </header>
    <InventorySubnav />
    <div class="inventory-panel inventory-filter">
      <label class="keyword"
        >仓库名称 / 编码<input v-model="keyword" type="search" /></label
      ><RouterLink
        v-if="canWrite"
        class="inv-button primary"
        to="/inventory/warehouses/new"
        >新增仓库</RouterLink
      >
    </div>
    <div v-if="error" class="inventory-state error">
      {{ error }}<button class="inv-button" @click="store.load">重试</button>
    </div>
    <div v-else-if="loading" class="inventory-state">正在加载仓库…</div>
    <div v-else-if="!rows.length" class="inventory-state">
      <strong>暂无仓库</strong
      ><RouterLink
        v-if="canWrite"
        class="inv-button primary"
        to="/inventory/warehouses/new"
        >新增仓库</RouterLink
      >
    </div>
    <div v-else class="inventory-table-wrap" style="margin-top: 12px">
      <table class="inventory-table">
        <thead>
          <tr>
            <th>仓库名称</th>
            <th>编码</th>
            <th>类型</th>
            <th>状态</th>
            <th>禁售</th>
            <th>联系人 / 电话</th>
            <th>地区 / 地址</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id">
            <td>
              <strong>{{ row.name }}</strong>
            </td>
            <td>{{ row.code }}</td>
            <td>{{ row.type === "physical" ? "实体仓" : "虚拟仓" }}</td>
            <td>
              <span class="inv-status" :class="`inv-status-${row.status}`">{{
                row.status === "enabled" ? "启用" : "禁用"
              }}</span>
            </td>
            <td>{{ row.saleProhibited ? "是" : "否" }}</td>
            <td>
              {{ row.contactName ?? "—" }}<small>{{ row.phone ?? "—" }}</small>
            </td>
            <td>
              {{
                [row.provinceCode, row.cityCode, row.districtCode]
                  .filter(Boolean)
                  .join(" / ") || "—"
              }}<small>{{ row.address ?? "—" }}</small>
            </td>
            <td>
              <RouterLink
                v-if="canWrite"
                :to="`/inventory/warehouses/${row.id}/edit`"
                >编辑</RouterLink
              ><span v-else>只读</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
