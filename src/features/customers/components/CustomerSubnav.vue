<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <nav class="subnav" aria-label="客户模块二级导航">
    <RouterLink to="/customers">客户列表</RouterLink>
    <RouterLink to="/customers/categories">客户分类</RouterLink>
    <RouterLink to="/customers/tags">客户标签</RouterLink>
    <RouterLink to="/customers/smart-tags">智能标签</RouterLink>
    <RouterLink to="/customers/opportunities">商机</RouterLink>
    <RouterLink to="/customers/frequent-products">常购商品</RouterLink>
    <RouterLink to="/customers/map">客户地图</RouterLink>
    <RouterLink to="/customers/public-sea">客户公海</RouterLink>
    <RouterLink to="/customers/fieldwork/dashboard">外勤拜访</RouterLink>
    <RouterLink to="/customers/membership-levels">会员等级</RouterLink>
    <RouterLink to="/customers/points">积分管理</RouterLink>
    <RouterLink to="/customers/coupons">优惠券</RouterLink>
    <RouterLink to="/customers/promotions">促销活动</RouterLink>
    <RouterLink to="/customers/voucher-campaigns">易发券</RouterLink>
    <RouterLink to="/customers/articles">获客文章</RouterLink>
    <RouterLink to="/customers/marketing-analysis">营销分析</RouterLink>
    <RouterLink to="/customers/wecom">企微运营</RouterLink>
    <RouterLink to="/customers/mall">商城运营</RouterLink>
  </nav>
</template>

<style scoped>
.subnav { display: flex; gap: 24px; min-height: 44px; padding: 0 18px; overflow-x: auto; background: #fff; border: 1px solid var(--color-border); border-radius: var(--radius-md); }.subnav a, .subnav span { display: flex; flex: 0 0 auto; align-items: center; color: var(--color-muted); text-decoration: none; }.subnav a.router-link-exact-active { color: var(--color-primary-strong); font-weight: 700; box-shadow: inset 0 -2px var(--color-primary); }.subnav span { margin-left: auto; font-size: 12px; }
</style>
