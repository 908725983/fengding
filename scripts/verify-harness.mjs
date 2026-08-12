import { createHash } from 'node:crypto'
import { readFile, readdir, stat } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const root = resolve(scriptDirectory, '..')
const failures = []

const requiredFiles = [
  'AGENTS.md',
  'ARCHITECTURE.md',
  'docs/DESIGN.md',
  'docs/FRONTEND.md',
  'docs/PLANS.md',
  'docs/PRODUCT_SENSE.md',
  'docs/QUALITY_SCORE.md',
  'docs/RELIABILITY.md',
  'docs/SECURITY.md',
  'docs/design-docs/index.md',
  'docs/design-docs/core-beliefs.md',
  'docs/design-docs/implementation-sequence.md',
  'docs/exec-plans/tech-debt-tracker.md',
  'docs/generated/db-schema.md',
  'docs/product-specs/index.md',
  'docs/product-specs/dashboard.md',
  'docs/product-specs/orders.md',
  'docs/product-specs/products.md',
  'docs/product-specs/procurement.md',
  'docs/product-specs/inventory.md',
  'docs/product-specs/customers.md',
  'docs/product-specs/finance.md',
  'docs/product-specs/settings.md',
  'docs/references/source-requirements.md',
  'docs/references/requirements-manifest.json',
  'mock/fixtures/baseline.json',
  'mock/handlers/README.md',
  'mock/schemas/README.md',
  'mock/scenarios/normal.json',
  'mock/scenarios/empty.json',
  'mock/scenarios/error.json',
  'mock/scenarios/slow.json',
  'mock/scenarios/permission-denied.json',
  'scripts/generate-db-schema.mjs',
]

const requiredDirectories = [
  'docs/design-docs',
  'docs/exec-plans/active',
  'docs/exec-plans/completed',
  'docs/generated',
  'docs/product-specs',
  'docs/references',
]

const retiredPaths = [
  'feature_list.json',
  'progress.md',
  'docs/ROADMAP.md',
  'docs/DECISIONS.md',
  'docs/ENGINEERING_GUARDRAILS.md',
  'docs/OPEN_QUESTIONS.md',
  'docs/MOCK.md',
  'docs/ui-specs',
  'docs/exec-plans/TEMPLATE.md',
]

const domainSpecs = {
  首页: 'dashboard.md',
  订单: 'orders.md',
  商品: 'products.md',
  采购: 'procurement.md',
  库存: 'inventory.md',
  客户: 'customers.md',
  资金: 'finance.md',
  设置: 'settings.md',
}

const expectedDomainCounts = {
  首页: 1,
  订单: 6,
  商品: 6,
  采购: 5,
  库存: 6,
  客户: 10,
  资金: 5,
  设置: 4,
  商家: 1,
  数据: 1,
}

const foundationIds = new Set(['HNS-001', 'SHELL-001'])
const allowedReadiness = new Set(['source-only', 'ready', 'blocked'])
const allowedDecisionStates = new Set(['open', 'decided', 'not-applicable'])

async function exists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

function extractSection(text, heading) {
  const marker = `## ${heading}`
  const start = text.indexOf(marker)
  if (start < 0) return ''
  const next = text.indexOf('\n## ', start + marker.length)
  return next < 0 ? text.slice(start) : text.slice(start, next)
}

function parseMarkdownRows(section, firstCellPattern) {
  const rows = []
  for (const line of section.split(/\r?\n/)) {
    if (!line.trim().startsWith('|')) continue
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim())
    const first = (cells[0] ?? '').replaceAll('`', '')
    if (firstCellPattern.test(first)) rows.push(cells)
  }
  return rows
}

function cleanCell(value) {
  return value.replaceAll('`', '').trim()
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function sourceContainsSection(text, sectionNumber) {
  if (sectionNumber.includes('.')) {
    return new RegExp(`^#{2,6}\\s+${escapeRegExp(sectionNumber)}(?:\\s|\\b)`, 'm').test(text)
  }
  const chineseNumerals = { 1: '一', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六', 7: '七', 8: '八', 9: '九', 10: '十' }
  const chinese = chineseNumerals[Number(sectionNumber)]
  return (
    new RegExp(`^###\\s+${escapeRegExp(sectionNumber)}\\.`, 'm').test(text) ||
    (chinese ? new RegExp(`^##\\s+${chinese}、`, 'm').test(text) : false)
  )
}

function extractSourceSectionNumbers(value) {
  const sectionNumbers = []
  for (const match of value.matchAll(/§(\d+(?:\.\d+)*)(?:～§?(\d+(?:\.\d+)*))?/g)) {
    sectionNumbers.push(match[1])
    if (match[2]) sectionNumbers.push(match[2])
  }
  return [...new Set(sectionNumbers)]
}

function extractSubsection(text, heading) {
  const headingMatch = new RegExp(`^${escapeRegExp(heading)}\\r?$`, 'm').exec(text)
  if (!headingMatch) return ''
  const lineEnd = text.indexOf('\n', headingMatch.index)
  const contentStart = lineEnd < 0 ? text.length : lineEnd + 1
  const remainder = text.slice(contentStart)
  const nextHeading = /^### /m.exec(remainder)
  return (nextHeading ? remainder.slice(0, nextHeading.index) : remainder).trim()
}

function getMeta(contents, name) {
  return contents.match(new RegExp(`^- ${name}：(.+)$`, 'm'))?.[1].trim()
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    if (entry.isDirectory() && ['node_modules', 'dist', '.git', '.npm-cache'].includes(entry.name)) continue
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await walk(path)))
    else files.push(path)
  }
  return files
}

for (const path of requiredFiles) {
  if (!(await exists(resolve(root, path)))) failures.push(`缺少推荐结构中的文件：${path}`)
}
for (const path of requiredDirectories) {
  if (!(await exists(resolve(root, path)))) failures.push(`缺少推荐结构中的目录：${path}`)
}
for (const path of retiredPaths) {
  if (await exists(resolve(root, path))) failures.push(`发现已归并的重复入口：${path}`)
}

const agents = await readFile(resolve(root, 'AGENTS.md'), 'utf8')
const agentLines = agents.trimEnd().split(/\r?\n/).length
if (agentLines > 80) failures.push(`AGENTS.md 应保持为短导航，当前 ${agentLines} 行（上限 80）`)
for (const requiredReference of [
  'ARCHITECTURE.md',
  'docs/QUALITY_SCORE.md',
  'docs/PLANS.md',
  'docs/product-specs/index.md',
  'docs/design-docs/implementation-sequence.md',
  'docs/RELIABILITY.md',
]) {
  if (!agents.includes(requiredReference)) failures.push(`AGENTS.md 未路由到：${requiredReference}`)
}
for (const requiredGate of ['source-only', 'ready', '人工决策', '不得使用行业惯例']) {
  if (!agents.includes(requiredGate)) failures.push(`AGENTS.md 缺少防猜测门禁：${requiredGate}`)
}

const requirementsManifest = JSON.parse(
  await readFile(resolve(root, 'docs/references/requirements-manifest.json'), 'utf8'),
)
if (requirementsManifest.files.length !== 8) {
  failures.push(`需求快照应为 8 份，当前 ${requirementsManifest.files.length} 份`)
}
const requirementNames = new Set(requirementsManifest.files.map((source) => source.name))
const requirementTexts = new Map()
for (const source of requirementsManifest.files) {
  const snapshotPath = resolve(root, 'docs/references/requirements', source.name)
  if (!(await exists(snapshotPath))) {
    failures.push(`缺少需求快照：${source.name}`)
    continue
  }
  const snapshotBytes = await readFile(snapshotPath)
  const snapshotHash = createHash('sha256').update(snapshotBytes).digest('hex')
  if (snapshotHash !== source.sha256 || snapshotBytes.length !== source.bytes) {
    failures.push(`需求快照与 manifest 不一致：${source.name}`)
  }
  const snapshotText = snapshotBytes.toString('utf8')
  const snapshotLines = snapshotText.trimEnd().split(/\r?\n/).length
  if (snapshotLines !== source.lines) failures.push(`需求快照行数与 manifest 不一致：${source.name}`)
  requirementTexts.set(source.name, snapshotText)

  const upstreamPath = resolve(requirementsManifest.upstream_root, source.name)
  if (await exists(upstreamPath)) {
    const upstreamHash = createHash('sha256').update(await readFile(upstreamPath)).digest('hex')
    if (upstreamHash !== source.sha256) failures.push(`上游需求已变化但尚未同步评审：${source.name}`)
  }
}

const catalogText = await readFile(resolve(root, 'docs/product-specs/index.md'), 'utf8')
const featureSection = extractSection(catalogText, '功能切片目录')
const featureRows = parseMarkdownRows(featureSection, /^[A-Z]{3,5}-\d{3}$/)
const features = []
const featureIds = new Set()

for (const cells of featureRows) {
  if (cells.length !== 8) {
    failures.push(`功能目录行必须有 8 列：${cells.join(' | ')}`)
    continue
  }
  const [rawId, rawDomain, rawName, rawPriority, rawSource, rawDependencies, rawRules, rawReadiness] = cells
  const id = cleanCell(rawId)
  const domain = cleanCell(rawDomain)
  const name = cleanCell(rawName)
  const priority = cleanCell(rawPriority)
  const source = cleanCell(rawSource)
  const dependencies = cleanCell(rawDependencies) === '—' ? [] : cleanCell(rawDependencies).split(',').map((item) => item.trim())
  const rules = cleanCell(rawRules) === '—' ? [] : cleanCell(rawRules).split(',').map((item) => item.trim())
  const readiness = cleanCell(rawReadiness)
  const sourceName = source.match(/\d{2}-[^\s]+\.md/)?.[0]

  if (featureIds.has(id)) failures.push(`功能 ID 重复：${id}`)
  featureIds.add(id)
  if (!name) failures.push(`${id} 缺少功能名称`)
  if (!(domain in expectedDomainCounts)) failures.push(`${id} 使用未知领域：${domain}`)
  if (!['P0', 'P1', 'P2', '—'].includes(priority)) failures.push(`${id} 使用未知优先级：${priority}`)
  if (!allowedReadiness.has(readiness)) failures.push(`${id} 使用未知字段准备度：${readiness}`)
  if (readiness === 'blocked' && priority !== '—') failures.push(`${id} blocked 时优先级应为“—”`)
  if (readiness !== 'blocked' && priority === '—') failures.push(`${id} 可实施但没有优先级`)
  if (!sourceName || !requirementNames.has(sourceName)) failures.push(`${id} 原始需求文件不可定位：${source}`)
  if (!source.includes('§')) failures.push(`${id} 原始需求缺少精确章节：${source}`)

  const sourceText = sourceName ? requirementTexts.get(sourceName) : undefined
  const sectionNumbers = extractSourceSectionNumbers(source)
  for (const sectionNumber of sectionNumbers) {
    if (sourceText && !sourceContainsSection(sourceText, sectionNumber)) {
      failures.push(`${id} 引用的原文章节不存在：${sourceName} §${sectionNumber}`)
    }
  }

  features.push({ id, domain, name, priority, source, sourceName, dependencies, rules, readiness })
}

if (features.length !== 45) failures.push(`功能目录应为 45 项（43 可进入规格提取 + 2 blocked），当前 ${features.length} 项`)
for (const [domain, expectedCount] of Object.entries(expectedDomainCounts)) {
  const actualCount = features.filter((feature) => feature.domain === domain).length
  if (actualCount !== expectedCount) failures.push(`${domain} 功能切片应为 ${expectedCount} 项，当前 ${actualCount} 项`)
}

for (const marker of [
  '## 全局需求入口',
  '01-整体架构与首页.md §1',
  '01-整体架构与首页.md §2',
  '01-整体架构与首页.md §3',
  '01-整体架构与首页.md §4',
  '01-整体架构与首页.md §5',
]) {
  if (!catalogText.includes(marker)) failures.push(`产品规格索引遗漏全局需求入口：${marker}`)
}

const requiredBusinessSectionCoverage = {
  '02-订单模块.md': ['2', '3', '4', '5', '6', '7'],
  '03-商品模块.md': ['2', '3', '4', '5', '6'],
  '04-采购模块.md': ['2', '3', '4', '5', '6'],
  '05-库存模块.md': ['2', '3', '4', '5', '6', '7'],
  '06-客户模块.md': ['2', '3', '4', '5', '6', '7', '8'],
  '07-资金模块.md': ['2', '3', '4', '5', '6', '7', '8', '9'],
  '08-设置模块.md': ['2', '3', '4', '5'],
}
for (const [sourceName, sections] of Object.entries(requiredBusinessSectionCoverage)) {
  const mappedSources = features
    .filter((feature) => feature.sourceName === sourceName)
    .map((feature) => feature.source)
    .join(' ')
  for (const sectionNumber of sections) {
    if (!new RegExp(`§${sectionNumber}(?:\\.|、|～|\\s|$)`).test(mappedSources)) {
      failures.push(`功能目录没有覆盖原始需求大节：${sourceName} §${sectionNumber}`)
    }
  }
}

const allKnownIds = new Set([...foundationIds, ...featureIds])
for (const feature of features) {
  for (const dependency of feature.dependencies) {
    if (!allKnownIds.has(dependency)) failures.push(`${feature.id} 引用了未知依赖：${dependency}`)
    if (dependency === feature.id) failures.push(`${feature.id} 不能依赖自身`)
  }
}

const featureById = new Map(features.map((feature) => [feature.id, feature]))
const visiting = new Set()
const visited = new Set()
function visitFeature(featureId, path = []) {
  if (visiting.has(featureId)) {
    failures.push(`功能依赖存在循环：${[...path, featureId].join(' -> ')}`)
    return
  }
  if (visited.has(featureId) || foundationIds.has(featureId)) return
  visiting.add(featureId)
  const feature = featureById.get(featureId)
  for (const dependency of feature?.dependencies ?? []) visitFeature(dependency, [...path, featureId])
  visiting.delete(featureId)
  visited.add(featureId)
}
for (const featureId of featureIds) visitFeature(featureId)

const productSpecPaths = requiredFiles.filter(
  (path) => path.startsWith('docs/product-specs/') && path !== 'docs/product-specs/index.md',
)
const productSpecTexts = new Map()
for (const path of productSpecPaths) {
  const contents = await readFile(resolve(root, path), 'utf8')
  productSpecTexts.set(path.split('/').at(-1), contents)
  if (!contents.startsWith('# ')) failures.push(`${path} 缺少一级标题`)
  if (!contents.includes('## 需求来源与事实边界')) failures.push(`${path} 缺少需求来源与事实边界`)
  if (!/## .*验收/.test(contents)) failures.push(`${path} 缺少验收章节`)
}

const contractHeadings = [
  '### 事实来源',
  '### 页面与导航',
  '### 筛选与列表',
  '### 表单与校验',
  '### 详情与操作矩阵',
  '### 状态与计算',
  '### 页面状态与 Mock',
  '### 验收追踪',
]
const readyContracts = new Map()
for (const feature of features) {
  if (feature.readiness === 'blocked') continue
  const specName = domainSpecs[feature.domain]
  const specText = productSpecTexts.get(specName)
  if (!specName || !specText) {
    failures.push(`${feature.id} 没有对应领域规格`)
    continue
  }
  if (!specText.includes(feature.sourceName)) failures.push(`${feature.id} 的领域规格未链接原始需求：${feature.sourceName}`)
  if (feature.readiness === 'ready') {
    const contractSection = extractSection(specText, `${feature.id} 字段与交互契约`)
    if (!contractSection) failures.push(`${feature.id} 标记 ready 但没有字段与交互契约`)
    for (const heading of contractHeadings) {
      const headingCount = contractSection ? contractSection.split(heading).length - 1 : 0
      if (headingCount !== 1) failures.push(`${feature.id} 字段契约章节应出现一次：${heading}`)
      const subsection = contractSection ? extractSubsection(contractSection, heading) : ''
      if (!subsection) failures.push(`${feature.id} 字段契约章节为空：${heading}`)
    }
    for (const forbiddenPhrase of ['TODO', 'TBD', '待补充', '按常规处理', '合理默认', '参考竞品']) {
      if (contractSection.includes(forbiddenPhrase)) failures.push(`${feature.id} ready 契约含占位或猜测措辞：${forbiddenPhrase}`)
    }
    for (const sectionNumber of extractSourceSectionNumbers(feature.source)) {
      if (!contractSection.includes(`§${sectionNumber}`)) {
        failures.push(`${feature.id} ready 契约未引用目录中的原文章节：§${sectionNumber}`)
      }
    }
    for (const globalMarker of ['01-整体架构与首页.md', '§4', '§5']) {
      if (!contractSection.includes(globalMarker)) failures.push(`${feature.id} ready 契约遗漏全局来源：${globalMarker}`)
    }
    for (const ruleId of feature.rules) {
      if (!contractSection.includes(ruleId)) failures.push(`${feature.id} ready 契约未追踪业务规则：${ruleId}`)
    }
    readyContracts.set(feature.id, contractSection)
  }
}

const ruleRanges = { ORD: 15, PRD: 17, PUR: 10, INV: 16, CUS: 12, FIN: 11, SET: 10 }
const allSpecText = [...productSpecTexts.values()].join('\n')
const assignedRules = new Set(features.flatMap((feature) => feature.rules))
const allRawText = [...requirementTexts.values()].join('\n')
for (const [prefix, max] of Object.entries(ruleRanges)) {
  for (let index = 1; index <= max; index += 1) {
    const ruleId = `${prefix}-${String(index).padStart(2, '0')}`
    if (!allRawText.includes(ruleId)) failures.push(`原始需求缺少预期业务规则：${ruleId}`)
    if (!allSpecText.includes(ruleId)) failures.push(`业务规则未进入领域规格：${ruleId}`)
    if (!assignedRules.has(ruleId)) failures.push(`业务规则未分配到功能切片：${ruleId}`)
  }
}
for (const ruleId of assignedRules) {
  if (!/^(ORD|PRD|PUR|INV|CUS|FIN|SET)-\d{2}$/.test(ruleId)) failures.push(`功能目录使用未知规则 ID：${ruleId}`)
}

const decisionSection = extractSection(catalogText, '已知缺口与人工决策门')
const decisionRows = parseMarkdownRows(decisionSection, /^DEC-[A-Z]+-\d{3}$/)
const decisions = []
const decisionIds = new Set()
for (const cells of decisionRows) {
  if (cells.length !== 8) {
    failures.push(`人工决策行必须有 8 列：${cells.join(' | ')}`)
    continue
  }
  const [rawId, rawFact, rawEvidence, rawBlocked, rawSafe, rawOwner, rawState, rawResolution] = cells
  const id = cleanCell(rawId)
  const fact = cleanCell(rawFact)
  const evidence = cleanCell(rawEvidence)
  const blockedScope = cleanCell(rawBlocked)
  const safeScope = cleanCell(rawSafe)
  const owner = cleanCell(rawOwner)
  const state = cleanCell(rawState)
  const resolution = cleanCell(rawResolution)
  if (decisionIds.has(id)) failures.push(`人工决策 ID 重复：${id}`)
  decisionIds.add(id)
  if (!allowedDecisionStates.has(state)) failures.push(`${id} 使用未知状态：${state}`)
  if ([fact, evidence, blockedScope, safeScope, owner].some((value) => !value || value === '—')) {
    failures.push(`${id} 缺少事实、证据、范围或决定人`)
  }
  if (!/\d{2}-[^|`]+\.md/.test(evidence)) failures.push(`${id} 原始证据没有需求文件名`)
  if (!evidence.includes('§') && !/(ORD|PRD|PUR|INV|CUS|FIN|SET)-\d{2}/.test(evidence)) {
    failures.push(`${id} 原始证据没有精确章节或规则 ID`)
  }
  if (state === 'open' && resolution !== '—') failures.push(`${id} 仍为 open，但已填写结论；应先核对并更新状态`)
  if (['decided', 'not-applicable'].includes(state) && (!resolution || resolution === '—')) {
    failures.push(`${id} 状态为 ${state}，但没有结论与写回位置`)
  }
  if (state === 'decided' && !/\.md/.test(resolution)) failures.push(`${id} 已决定但没有领域规格/计划写回路径`)
  const blockedIds = blockedScope.match(/[A-Z]{3,5}-\d{3}/g) ?? []
  if (blockedIds.length === 0) failures.push(`${id} 阻塞范围没有功能 ID`)
  for (const blockedId of blockedIds) {
    if (!featureIds.has(blockedId)) failures.push(`${id} 阻塞未知功能：${blockedId}`)
  }
  decisions.push({ id, blockedIds, state, resolution })
}
if (decisions.length < 20) failures.push(`已知人工决策门不应少于 20 项，当前 ${decisions.length} 项`)

for (const feature of features.filter((item) => item.readiness === 'ready')) {
  const openBlockers = decisions.filter(
    (decision) => decision.state === 'open' && decision.blockedIds.includes(feature.id),
  )
  if (openBlockers.length > 0) {
    failures.push(`${feature.id} 标记 ready，但仍有未解决人工决策：${openBlockers.map((item) => item.id).join(', ')}`)
  }
  const contractSection = readyContracts.get(feature.id) ?? ''
  for (const line of contractSection.split(/\r?\n/).filter((item) => item.includes('未定义'))) {
    const referencedDecisions = line.match(/DEC-[A-Z]+-\d{3}/g) ?? []
    if (referencedDecisions.length === 0) failures.push(`${feature.id} ready 契约含“未定义”但同一行没有 DEC-*：${line.trim()}`)
    for (const decisionId of referencedDecisions) {
      if (!decisionIds.has(decisionId)) failures.push(`${feature.id} ready 契约引用未知决策：${decisionId}`)
    }
  }
}

const sequenceText = await readFile(resolve(root, 'docs/design-docs/implementation-sequence.md'), 'utf8')
for (const feature of features) {
  if (!sequenceText.includes(feature.id)) failures.push(`总体实现顺序未覆盖功能：${feature.id}`)
}
for (const marker of ['## 切片开工门', '## 当前下一动作', 'source-only', 'DEC-CUS-001']) {
  if (!sequenceText.includes(marker)) failures.push(`总体实现顺序缺少关键门禁：${marker}`)
}

const qualityText = await readFile(resolve(root, 'docs/QUALITY_SCORE.md'), 'utf8')
const implementableCount = features.filter((feature) => feature.readiness !== 'blocked').length
const blockedCount = features.filter((feature) => feature.readiness === 'blocked').length
for (const marker of [
  `| 可进入规格提取的业务切片 | ${implementableCount} |`,
  `| 因需求不足 blocked | ${blockedCount} |`,
  `| 已知人工决策门 | ${decisions.length} |`,
  'CUS-001',
]) {
  if (!qualityText.includes(marker)) failures.push(`QUALITY_SCORE 与功能目录不一致：${marker}`)
}

const planHeadings = [
  '## 目标',
  '## 范围与非目标',
  '## 事实来源',
  '## 前置门禁',
  '## 验证路径',
  '## 风险与阻塞',
  '## 进度日志',
  '## 开放决策',
  '## 中断恢复点',
]
const activeDirectory = resolve(root, 'docs/exec-plans/active')
const completedDirectory = resolve(root, 'docs/exec-plans/completed')
const activePlanNames = (await readdir(activeDirectory)).filter((name) => name.endsWith('.md'))
const completedPlanNames = (await readdir(completedDirectory)).filter((name) => name.endsWith('.md'))
const completedIds = new Set()

for (const name of completedPlanNames) {
  const contents = await readFile(resolve(completedDirectory, name), 'utf8')
  if (!/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md$/.test(name)) {
    failures.push(`completed plan 命名不符合 YYYY-MM-DD-short-topic.md：${name}`)
  }
  const completedType = getMeta(contents, '类型')
  const completedStage = getMeta(contents, '当前阶段')
  if (!['business-feature', 'harness', 'architecture', 'maintenance'].includes(completedType)) {
    failures.push(`${name} 使用未知计划类型：${completedType}`)
  }
  if (getMeta(contents, '状态') !== 'completed') failures.push(`${name} 位于 completed/ 但状态不是 completed`)
  if (completedType === 'business-feature' && completedStage !== 'verification') {
    failures.push(`${name} 的业务功能完成时当前阶段必须为 verification`)
  } else if (completedType !== 'business-feature' && !['verification', 'audit'].includes(completedStage)) {
    failures.push(`${name} 的非业务计划完成阶段必须为 verification 或 audit`)
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(getMeta(contents, '完成日期') ?? '')) failures.push(`${name} 缺少有效完成日期`)
  for (const heading of ['## 目标', '## 范围与非目标', '## 事实来源', '## 验证路径', '## 进度日志', '## 中断恢复点']) {
    if (!contents.includes(heading)) failures.push(`completed plan 缺少章节“${heading}”：${name}`)
  }
  if (/^- \[ \]/m.test(contents)) failures.push(`completed plan 仍有未完成步骤：${name}`)
  const recordedIds = (getMeta(contents, '功能') ?? '').match(/[A-Z]{3,5}-\d{3}/g) ?? []
  for (const id of recordedIds) completedIds.add(id)
}
for (const foundationId of foundationIds) {
  if (!completedIds.has(foundationId)) failures.push(`工程前提缺少 completed 证据：${foundationId}`)
}

let activeBusinessPlans = 0
for (const name of activePlanNames) {
  if (!/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md$/.test(name)) {
    failures.push(`active plan 命名不符合 YYYY-MM-DD-short-topic.md：${name}`)
  }
  const contents = await readFile(resolve(activeDirectory, name), 'utf8')
  for (const heading of planHeadings) {
    if (!contents.includes(heading)) failures.push(`active plan 缺少章节“${heading}”：${name}`)
  }
  const currentSteps = contents.match(/^- \[ \] 当前步骤：/gm) ?? []
  if (currentSteps.length !== 1) failures.push(`active plan 必须有且仅有一个当前步骤：${name}`)

  const type = getMeta(contents, '类型')
  const featureId = getMeta(contents, '功能')
  const stage = getMeta(contents, '当前阶段')
  const status = getMeta(contents, '状态')
  const lastUpdated = getMeta(contents, '最近更新')
  if (!['business-feature', 'harness', 'architecture', 'maintenance'].includes(type)) failures.push(`${name} 使用未知计划类型：${type}`)
  if (!['specification', 'implementation', 'verification', 'audit'].includes(stage)) failures.push(`${name} 使用未知当前阶段：${stage}`)
  if (status !== 'active') failures.push(`${name} 位于 active/ 但状态不是 active`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(lastUpdated ?? '')) failures.push(`${name} 缺少有效最近更新日期`)

  if (type === 'business-feature') {
    activeBusinessPlans += 1
    const feature = featureById.get(featureId)
    if (!feature) {
      failures.push(`${name} 引用未知业务功能：${featureId}`)
      continue
    }
    if (feature.readiness === 'blocked') failures.push(`${name} 尝试启动 blocked 功能：${featureId}`)
    const specName = domainSpecs[feature.domain]
    if (!contents.includes(`docs/product-specs/${specName}`)) failures.push(`${name} 未引用当前领域规格`)
    if (!contents.includes(`docs/references/requirements/${feature.sourceName}`)) failures.push(`${name} 未引用精确原始需求文件`)
    for (const sectionNumber of extractSourceSectionNumbers(feature.source)) {
      if (!contents.includes(`§${sectionNumber}`)) failures.push(`${name} 未引用目录指定原文章节：§${sectionNumber}`)
    }
    for (const globalMarker of ['01-整体架构与首页.md', '§4', '§5']) {
      if (!contents.includes(globalMarker)) failures.push(`${name} 未引用业务计划全局资料：${globalMarker}`)
    }
    for (const dependency of feature.dependencies) {
      if (!completedIds.has(dependency)) failures.push(`${name} 的依赖尚无 passing 证据：${dependency}`)
    }
    if (['implementation', 'verification'].includes(stage)) {
      if (feature.readiness !== 'ready') failures.push(`${name} 已进入 ${stage}，但 ${featureId} 尚未 ready`)
      const openBlockers = decisions.filter(
        (decision) => decision.state === 'open' && decision.blockedIds.includes(featureId),
      )
      if (openBlockers.length > 0) {
        failures.push(`${name} 带着未解决人工决策进入 ${stage}：${openBlockers.map((item) => item.id).join(', ')}`)
      }
    }
    const openDecisionSection = extractSection(contents, '开放决策')
    if (!openDecisionSection.includes('| 决策 ID |') && !/^## 开放决策\s+无[。\s]*$/m.test(openDecisionSection.trim())) {
      failures.push(`${name} 的开放决策必须使用规定表格或明确写“无”`)
    }
    for (const decision of decisions.filter(
      (item) => item.state === 'open' && item.blockedIds.includes(featureId),
    )) {
      if (!openDecisionSection.includes(decision.id)) failures.push(`${name} 未登记当前切片的开放决策：${decision.id}`)
    }
    if (openDecisionSection.includes('| 决策 ID |') && !openDecisionSection.includes('结论与写回位置')) {
      failures.push(`${name} 的开放决策表缺少“结论与写回位置”列`)
    }
  } else if (featureId !== '不适用') {
    failures.push(`${name} 不是业务计划，功能应写“不适用”`)
  }
}
if (activeBusinessPlans > 1) failures.push(`同一时间最多一个业务 active plan，当前 ${activeBusinessPlans} 个`)

for (const featureId of completedIds) {
  if (foundationIds.has(featureId)) continue
  const feature = featureById.get(featureId)
  if (!feature) failures.push(`completed plan 引用了目录外功能：${featureId}`)
  else {
    if (feature.readiness !== 'ready') failures.push(`${featureId} 已 completed，但字段准备度不是 ready`)
    if (!qualityText.includes(featureId)) failures.push(`${featureId} 已 completed，但 QUALITY_SCORE 没有证据入口`)
  }
}

const baselineFixture = JSON.parse(await readFile(resolve(root, 'mock/fixtures/baseline.json'), 'utf8'))
if (!Number.isInteger(baselineFixture.schemaVersion) || baselineFixture.schemaVersion < 1) {
  failures.push('Mock baseline 必须提供正整数 schemaVersion')
}
if (baselineFixture.scenario !== 'normal') failures.push('Mock baseline 的默认场景必须为 normal')
if (Number.isNaN(Date.parse(baselineFixture.clock))) failures.push('Mock baseline 必须提供可解析的固定 clock')
if (!baselineFixture.featureData || typeof baselineFixture.featureData !== 'object' || Array.isArray(baselineFixture.featureData)) {
  failures.push('Mock baseline 必须使用 featureData 对象隔离业务切片数据')
} else {
  for (const featureId of Object.keys(baselineFixture.featureData)) {
    const feature = featureById.get(featureId)
    if (!feature) failures.push(`Mock baseline 含目录外功能数据：${featureId}`)
    else if (feature.readiness !== 'ready') failures.push(`Mock baseline 提前包含尚未 ready 的功能数据：${featureId}`)
  }
}
for (const key of Object.keys(baselineFixture)) {
  if (!['schemaVersion', 'scenario', 'clock', 'featureData'].includes(key)) {
    failures.push(`Mock baseline 不得在 featureData 外维护未登记数据：${key}`)
  }
}

for (const scenarioName of ['normal', 'empty', 'error', 'slow', 'permission-denied']) {
  const scenario = JSON.parse(await readFile(resolve(root, `mock/scenarios/${scenarioName}.json`), 'utf8'))
  if (scenario.name !== scenarioName) failures.push(`Mock 场景文件名与 name 不一致：${scenarioName}`)
  if (!Number.isFinite(scenario.latencyMs) || scenario.latencyMs < 0) failures.push(`Mock 场景缺少有效 latencyMs：${scenarioName}`)
}
const mockSchemaGuide = await readFile(resolve(root, 'mock/schemas/README.md'), 'utf8')
for (const marker of ['featureData.<功能ID>', '字段准备度为 ready', '禁止提前放入', '一个拥有者切片', 'customerId']) {
  if (!mockSchemaGuide.includes(marker)) failures.push(`Mock schema 指南缺少防猜测规则：${marker}`)
}

const generatedSchema = await readFile(resolve(root, 'docs/generated/db-schema.md'), 'utf8')
for (const marker of ['来源：', '生成方式：`npm run docs:generate`', '最近刷新：', '禁止手工编辑', '## 生成内容']) {
  if (!generatedSchema.includes(marker)) failures.push(`生成文档缺少元信息：${marker}`)
}
const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
if (packageJson.scripts?.['docs:generate'] !== 'node scripts/generate-db-schema.mjs') {
  failures.push('package.json 缺少稳定的 docs:generate 入口')
}
const executableSchemaFiles = (await walk(resolve(root, 'mock/schemas'))).filter(
  (path) => !path.endsWith('README.md'),
)
if (executableSchemaFiles.length === 0 && !generatedSchema.includes('当前没有可执行的业务 schema 文件')) {
  failures.push('生成数据结构与空 schema 现场不一致')
}
for (const marker of [
  `Mock schema 版本：${baselineFixture.schemaVersion}`,
  `默认场景：${baselineFixture.scenario}`,
]) {
  if (!generatedSchema.includes(marker)) failures.push(`生成数据结构与 baseline 不一致：${marker}`)
}
for (const featureId of Object.keys(baselineFixture.featureData ?? {})) {
  if (!generatedSchema.includes(`\`${featureId}\``)) failures.push(`生成数据结构遗漏 Mock 功能：${featureId}`)
}
for (const path of executableSchemaFiles) {
  const sourcePath = relative(root, path).replaceAll('\\', '/')
  const sourceHash = createHash('sha256').update(await readFile(path)).digest('hex')
  if (!generatedSchema.includes(sourcePath) || !generatedSchema.includes(sourceHash)) {
    failures.push(`生成数据结构未刷新 schema：${sourcePath}`)
  }
}

const sourceFiles = (await walk(resolve(root, 'src'))).filter((path) => /\.(vue|ts|tsx)$/.test(path))
for (const path of sourceFiles) {
  const contents = await readFile(path, 'utf8')
  const sourcePath = relative(root, path).replaceAll('\\', '/')
  if (/from\s+['"][^'"]*mock\/fixtures/.test(contents)) failures.push(`源代码不得直接导入 fixture：${sourcePath}`)
  if (path.endsWith('.vue') && /\bv-html\s*=/.test(contents)) failures.push(`Vue 模板禁止未经专门评审使用 v-html：${sourcePath}`)
  if (/\/views?\//.test(sourcePath) && /\b(fetch|localStorage|sessionStorage)\s*[.(]/.test(contents)) {
    failures.push(`View 不得直接请求网络或访问浏览器存储：${sourcePath}`)
  }
  if (/\/services?\//.test(sourcePath) && /(Math\.random\s*\(|Date\.now\s*\(|new\s+Date\s*\(\s*\))/.test(contents)) {
    failures.push(`Service 需注入 ID/Clock，不能用随机数或真实当前时间决定结果：${sourcePath}`)
  }
  const sourceDomain = sourcePath.match(/^src\/features\/([^/]+)\//)?.[1]
  const featureImports = [...contents.matchAll(/from\s+['"]@\/features\/([^/]+)\/([^'"]+)['"]/g)]
  for (const featureImport of featureImports) {
    const [, targetDomain, targetPath] = featureImport
    if (sourceDomain && targetDomain !== sourceDomain && targetPath !== 'public' && !targetPath.startsWith('public/')) {
      failures.push(`跨领域只能导入对方 public.ts：${sourcePath} -> ${targetDomain}/${targetPath}`)
    }
  }
}

const securityFiles = [
  ...(await walk(resolve(root, 'src'))),
  ...(await walk(resolve(root, 'mock'))),
  ...(await walk(resolve(root, 'scripts'))),
].filter((path) => /\.(vue|ts|tsx|js|mjs|json|ps1)$/.test(path))
for (const path of securityFiles) {
  const contents = await readFile(path, 'utf8')
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(contents)) failures.push(`发现私钥内容：${relative(root, path)}`)
  if (/(api[_-]?key|access[_-]?token|client[_-]?secret)\s*[:=]\s*['"][^'"]{8,}['"]/i.test(contents)) {
    failures.push(`发现疑似硬编码凭据：${relative(root, path)}`)
  }
}

const markdownFiles = (await walk(root)).filter(
  (path) => path.endsWith('.md') && !path.includes(resolve(root, 'docs/references/requirements')),
)
for (const path of markdownFiles) {
  const contents = await readFile(path, 'utf8')
  const targets = [...contents.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map((match) => match[1])
  for (const target of targets) {
    if (/^(https?:|#)/.test(target)) continue
    const cleanTarget = target.split('#')[0]
    if (cleanTarget && !(await exists(resolve(dirname(path), cleanTarget)))) {
      failures.push(`文档链接不可达：${relative(root, path)} -> ${target}`)
    }
  }
}

if (failures.length > 0) {
  console.error('Harness 验证失败：')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(
  `Harness 验证通过：${features.length} 个功能切片（${implementableCount} 可进入规格提取、${blockedCount} blocked），${decisions.length} 个决策门，${productSpecPaths.length} 份领域规格，${requirementsManifest.files.length} 份需求快照，${agentLines} 行入口导航。`,
)
