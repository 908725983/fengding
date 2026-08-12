<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'
const route = useRoute()
const links = [{ path: '/products/authorizations/plans', label: '授权方案' }, { path: '/products/authorizations/rules', label: '授权规则' }, { path: '/products/authorizations/specials', label: '特殊授权' }]
</script>
<template><nav class="authorization-subnav" aria-label="商品授权子导航"><RouterLink v-for="item in links" :key="item.path" :to="item.path" :class="{active:route.path.startsWith(item.path)}">{{ item.label }}</RouterLink></nav></template>
<style scoped>.authorization-subnav{display:flex;min-height:44px;align-items:stretch;padding:0 14px;overflow-x:auto;background:#fff;border:1px solid var(--color-border);border-radius:var(--radius-md) var(--radius-md) 0 0}.authorization-subnav a{display:flex;align-items:center;padding:0 16px;color:#667383;font-size:13px;text-decoration:none;border-bottom:2px solid transparent}.authorization-subnav a:hover,.authorization-subnav a.active{color:var(--color-primary-strong);border-bottom-color:var(--color-primary)}</style>
