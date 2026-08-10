<script setup lang="ts">
import { businessModules } from '@/app/module-catalog'

const harnessChecks = [
  { name: '产品与范围', detail: '目标、角色、边界已进入仓库' },
  { name: '业务规格', detail: '八个领域均有规则与验收入口' },
  { name: 'Mock 约束', detail: '确定性场景与重置机制已定义' },
  { name: '完成判定', detail: '状态、验证和证据可机械检查' },
]
</script>

<template>
  <section class="page" aria-labelledby="overview-title">
    <header class="page-header">
      <div>
        <p class="eyebrow">Prototype foundation</p>
        <h1 id="overview-title">原型工程总览</h1>
        <p class="page-header__description">当前完成的是 Harness 与应用壳基线，业务模块仍按功能清单逐项实施。</p>
      </div>
      <span class="status-badge status-badge--success">Harness Ready</span>
    </header>

    <div class="notice" role="status">
      <span class="notice__icon" aria-hidden="true">i</span>
      <div>
        <strong>此页面不是经营 Dashboard</strong>
        <p>这里用于确认原型环境、规格入口与模块状态。经营指标会在 DASH-001 实现后替换。</p>
      </div>
    </div>

    <section aria-labelledby="checks-title">
      <div class="section-heading">
        <div>
          <h2 id="checks-title">Harness 检查项</h2>
          <p>帮助后续开发在动手前找到确定事实。</p>
        </div>
        <span class="section-heading__count">4 / 4 已建立</span>
      </div>
      <div class="check-grid">
        <article v-for="check in harnessChecks" :key="check.name" class="check-card">
          <span class="check-card__icon" aria-hidden="true">✓</span>
          <div>
            <h3>{{ check.name }}</h3>
            <p>{{ check.detail }}</p>
          </div>
        </article>
      </div>
    </section>

    <section aria-labelledby="modules-title">
      <div class="section-heading">
        <div>
          <h2 id="modules-title">业务模块规划</h2>
          <p>点击模块可查看范围和对应规格位置。</p>
        </div>
        <span class="section-heading__count">0 / 8 业务模块已实现</span>
      </div>
      <div class="module-table-wrap">
        <table class="module-table">
          <thead>
            <tr>
              <th scope="col">模块</th>
              <th scope="col">本阶段职责</th>
              <th scope="col">规格</th>
              <th scope="col">状态</th>
              <th scope="col"><span class="sr-only">操作</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in businessModules" :key="item.key">
              <td>
                <span class="module-name__icon" aria-hidden="true">{{ item.shortLabel }}</span>
                <strong>{{ item.label }}</strong>
              </td>
              <td>{{ item.description }}</td>
              <td><code>{{ item.spec }}</code></td>
              <td><span class="status-badge status-badge--neutral">尚未开始</span></td>
              <td><RouterLink class="table-link" :to="item.path">查看入口</RouterLink></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </section>
</template>
