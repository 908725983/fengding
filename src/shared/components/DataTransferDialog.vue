<script setup lang="ts">
import { ref } from 'vue'
import { getApplicationMockRuntimeController } from '@/app/runtime/app-mock-runtime'

const controller = getApplicationMockRuntimeController()
const open = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const error = ref<string | null>(null)

function openDialog(): void {
  error.value = null
  open.value = true
}

function closeDialog(): void {
  open.value = false
  error.value = null
}

function exportData(): void {
  const timestamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
  const url = URL.createObjectURL(new Blob([controller.exportData()], { type: 'application/json;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `蜂订原型数据-${timestamp}.json`
  link.click()
  URL.revokeObjectURL(url)
}

async function importData(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!window.confirm('导入会替换当前地址中的核心业务数据，确定继续吗？')) return
  error.value = null
  try {
    controller.importData(await file.text())
    window.location.reload()
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '数据导入失败'
  }
}
</script>

<template>
  <button class="data-transfer-trigger" type="button" @click="openDialog">数据迁移</button>
  <Teleport to="body">
    <div v-if="open" class="data-transfer-dialog" role="dialog" aria-modal="true" aria-labelledby="data-transfer-title" @click.self="closeDialog">
      <section>
        <header>
          <div>
            <strong id="data-transfer-title">原型数据迁移</strong>
            <small>本地地址与部署地址的数据互不相通</small>
          </div>
          <button class="data-transfer-close" type="button" aria-label="关闭" @click="closeDialog">×</button>
        </header>
        <div class="data-transfer-body">
          <p>先在有数据的地址导出 JSON，再到目标地址导入。</p>
          <div class="data-transfer-actions">
            <button class="data-transfer-button primary" type="button" @click="exportData">↓ 导出当前数据</button>
            <button class="data-transfer-button" type="button" @click="fileInput?.click()">↑ 导入数据包</button>
            <input ref="fileInput" class="sr-only" type="file" accept="application/json,.json" @change="importData">
          </div>
          <p class="data-transfer-note">导入会完整替换目标地址中的商品、客户、仓库、供应商、订单和资金数据。</p>
          <p v-if="error" class="data-transfer-error" role="alert">{{ error }}</p>
        </div>
      </section>
    </div>
  </Teleport>
</template>
