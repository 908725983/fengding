import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { createFinanceMockSession, type FinanceScenarioName } from '../../../../mock/handlers/finance-handler'
import type { FinanceAccountDetail, FinanceAccountDraft, FinanceAccountPeriodRow, FinanceActor, FinanceBankDraft, FinancePeriodCard, SaveFinanceAccountInput, VisibleBankProfile } from '../types'
import { setCurrentFinanceRole } from './finance-access'

type ChannelRow = ReturnType<ReturnType<typeof createFinanceMockSession>['service']['listPaymentChannels']>[number]

export const useFinanceStore = defineStore('finance', () => {
  const scenario = ref<FinanceScenarioName>('normal'); const actor = ref<FinanceActor>({ role: 'super-admin', actorId: 'admin-demo' }); const month = ref('2026-08')
  const accounts = ref<FinanceAccountPeriodRow[]>([]); const detail = ref<FinanceAccountDetail | null>(null); const periods = ref<FinancePeriodCard[]>([]); const banks = ref<VisibleBankProfile[]>([]); const channels = ref<ChannelRow[]>([])
  const loading = ref(false); const saving = ref(false); const error = ref<string | null>(null); let session = createFinanceMockSession('normal')
  const canManage = computed(() => ['super-admin', 'finance'].includes(actor.value.role)); const stateVersion = () => session.repository.read().version
  async function execute<T>(operation: () => T): Promise<T | null> { loading.value = true; error.value = null; try { return await session.run(operation) } catch (caught) { error.value = caught instanceof Error ? caught.message : '资金数据加载失败'; return null } finally { loading.value = false } }
  async function loadAccounts(next = month.value): Promise<void> { month.value = next; const value = await execute(() => session.service.listAccounts(actor.value, next)); accounts.value = value ?? [] }
  async function loadDetail(id: string, next = month.value): Promise<void> { month.value = next; detail.value = await execute(() => session.service.getAccountDetail(actor.value, id, next)) }
  async function loadPeriods(year: number): Promise<void> { periods.value = await execute(() => session.service.listPeriodCards(actor.value, year)) ?? [] }
  async function loadBanks(): Promise<void> { banks.value = await execute(() => session.service.listBanks(actor.value)) ?? [] }
  async function loadChannels(): Promise<void> { channels.value = await execute(() => session.service.listPaymentChannels(actor.value)) ?? [] }
  async function setScenario(next: FinanceScenarioName): Promise<void> { scenario.value = next; actor.value = next === 'permission-denied' ? { role: 'warehouse', actorId: 'warehouse-demo' } : { role: 'super-admin', actorId: 'admin-demo' }; setCurrentFinanceRole(actor.value.role); session = createFinanceMockSession(next); await loadAccounts() }
  async function setRole(role: FinanceActor['role']): Promise<void> { actor.value = { role, actorId: `${role}-demo` }; setCurrentFinanceRole(role); await loadAccounts() }
  async function mutate<T>(operation: () => T): Promise<T> { saving.value = true; error.value = null; try { return await session.run(operation) } catch (caught) { error.value = caught instanceof Error ? caught.message : '保存失败'; throw caught } finally { saving.value = false } }
  async function saveAccount(input: SaveFinanceAccountInput) { const value = await mutate(() => session.service.saveAccount(actor.value, input)); await loadAccounts(); return value }
  async function saveBank(requestId: string, draft: FinanceBankDraft, existing?: VisibleBankProfile) { const value = await mutate(() => session.service.saveBank(actor.value, { requestId, bankId: existing?.id, expectedUpdatedAt: existing?.updatedAt, draft })); await loadBanks(); return value }
  async function closePeriod(monthValue: string) { const value = await mutate(() => session.service.closePeriod(actor.value, { requestId: crypto.randomUUID(), month: monthValue, expectedStateVersion: stateVersion() })); await loadPeriods(Number(monthValue.slice(0, 4))); return value }
  async function reversePeriod(monthValue: string, reason: string) { const value = await mutate(() => session.service.reversePeriod(actor.value, { requestId: crypto.randomUUID(), month: monthValue, reason, expectedStateVersion: stateVersion() })); await loadPeriods(Number(monthValue.slice(0, 4))); return value }
  async function applyChannel(channelId: string) { const value = await mutate(() => session.service.submitPaymentApplication(actor.value, { requestId: crypto.randomUUID(), channelId })); await loadChannels(); return value }
  function accountDraft(id: string): { account: FinanceAccountPeriodRow['account']; draft: FinanceAccountDraft } | null { const account = accounts.value.find((item) => item.account.id === id)?.account; return account ? { account, draft: { name: account.name, type: account.type, status: account.status, openingMonth: account.openingMonth, openingBalanceCents: account.openingBalanceCents } } : null }
  return { scenario, actor, month, accounts, detail, periods, banks, channels, loading, saving, error, canManage, loadAccounts, loadDetail, loadPeriods, loadBanks, loadChannels, setScenario, setRole, saveAccount, saveBank, closePeriod, reversePeriod, applyChannel, accountDraft }
})
