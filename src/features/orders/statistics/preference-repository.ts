import { assertStatisticsPivotConfig } from './schema'
import type { StatisticsPivotConfig, StatisticsPreferenceRecord } from './types'

export interface StatisticsPreferenceRepository {
  get(actorId: string, report: StatisticsPivotConfig['report']): StatisticsPivotConfig | null
  save(actorId: string, config: StatisticsPivotConfig): StatisticsPivotConfig
  reset(actorId: string, report: StatisticsPivotConfig['report']): void
  resetAll(): void
}

export class InMemoryStatisticsPreferenceRepository implements StatisticsPreferenceRepository {
  private records: StatisticsPreferenceRecord[] = []
  get(actorId: string, report: StatisticsPivotConfig['report']): StatisticsPivotConfig | null {
    return structuredClone(this.records.find((item) => item.actorId === actorId && item.report === report)?.config ?? null)
  }
  save(actorId: string, config: StatisticsPivotConfig): StatisticsPivotConfig {
    assertStatisticsPivotConfig(config)
    const next = structuredClone(config)
    const current = this.records.find((item) => item.actorId === actorId && item.report === config.report)
    if (current) current.config = next
    else this.records.push({ actorId, report: config.report, config: next })
    return structuredClone(next)
  }
  reset(actorId: string, report: StatisticsPivotConfig['report']): void { this.records = this.records.filter((item) => item.actorId !== actorId || item.report !== report) }
  resetAll(): void { this.records = [] }
}
