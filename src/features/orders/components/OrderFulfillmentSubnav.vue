<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>
<template><nav class="order-workspace-nav" aria-label="订单工作区"><RouterLink to="/orders">客户订单</RouterLink><RouterLink to="/orders/outbounds">销售出库单</RouterLink><RouterLink to="/orders/differences">差异单</RouterLink><RouterLink to="/orders/returns">客户退单</RouterLink></nav></template>
