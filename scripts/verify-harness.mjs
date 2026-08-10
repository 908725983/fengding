import { readFile, readdir, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const root = resolve(scriptDirectory, '..')
const failures = []

const requiredFiles = [
  'AGENTS.md',
  'ARCHITECTURE.md',
  'feature_list.json',
  'progress.md',
  'docs/PRODUCT_SENSE.md',
  'docs/ROADMAP.md',
  'docs/ENGINEERING_GUARDRAILS.md',
  'docs/OPEN_QUESTIONS.md',
  'docs/DECISIONS.md',
  'docs/SECURITY.md',
  'docs/QUALITY_SCORE.md',
  'docs/FRONTEND.md',
  'docs/MOCK.md',
  'docs/PLANS.md',
  'docs/RELIABILITY.md',
  'docs/exec-plans/TEMPLATE.md',
  'docs/ui-specs/README.md',
  'docs/ui-specs/TEMPLATE.md',
  'docs/references/requirements-manifest.json',
  'docs/product-specs/index.md',
  'docs/product-specs/dashboard.md',
  'docs/product-specs/orders.md',
  'docs/product-specs/products.md',
  'docs/product-specs/procurement.md',
  'docs/product-specs/inventory.md',
  'docs/product-specs/customers.md',
  'docs/product-specs/finance.md',
  'docs/product-specs/settings.md',
]

async function exists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

for (const path of requiredFiles) {
  if (!(await exists(resolve(root, path)))) failures.push(`缺少必要文件：${path}`)
}

const agents = await readFile(resolve(root, 'AGENTS.md'), 'utf8')
const agentLines = agents.trimEnd().split(/\r?\n/).length
if (agentLines > 100) failures.push(`AGENTS.md 应保持为短导航，当前 ${agentLines} 行（上限 100）`)

const featureList = JSON.parse(await readFile(resolve(root, 'feature_list.json'), 'utf8'))
const allowed = new Set(featureList.allowed_statuses)
const ids = new Set()
const inProgress = featureList.features.filter((feature) => feature.status === 'in_progress')
const businessDomains = new Set(['dashboard', 'orders', 'products', 'procurement', 'inventory', 'customers', 'finance', 'settings'])

if (inProgress.length > 1) failures.push(`最多允许一个 in_progress，当前为 ${inProgress.length}`)
if (inProgress.length === 1 && featureList.current_feature !== inProgress[0].id) {
  failures.push('current_feature 必须指向唯一的 in_progress 功能')
}
if (inProgress.length === 0 && featureList.current_feature !== null) {
  failures.push('没有 in_progress 功能时 current_feature 必须为 null')
}

for (const feature of featureList.features) {
  if (ids.has(feature.id)) failures.push(`功能 ID 重复：${feature.id}`)
  ids.add(feature.id)
  if (!allowed.has(feature.status)) failures.push(`${feature.id} 使用了非法状态：${feature.status}`)
  if (!feature.spec || !(await exists(resolve(root, feature.spec)))) failures.push(`${feature.id} 的规格入口不可达：${feature.spec}`)
  if (feature.plan && !(await exists(resolve(root, feature.plan)))) failures.push(`${feature.id} 的计划入口不可达：${feature.plan}`)
  if (feature.status === 'blocked' && !feature.blocked_reason) failures.push(`${feature.id} blocked 但没有 blocked_reason`)
  if (feature.status === 'passing' && (!feature.evidence || feature.evidence.length === 0)) failures.push(`${feature.id} passing 但没有证据`)
  if (!Array.isArray(feature.depends_on)) failures.push(`${feature.id} 缺少 depends_on 数组`)
  if (!Array.isArray(feature.source_sections) || feature.source_sections.length === 0) failures.push(`${feature.id} 缺少 source_sections`)
  if (!Array.isArray(feature.acceptance) || feature.acceptance.length === 0) failures.push(`${feature.id} 缺少 acceptance`)
  if (businessDomains.has(feature.domain) && ['in_progress', 'passing'].includes(feature.status)) {
    if (!feature.ui_spec) failures.push(`${feature.id} 已开始但没有 ui_spec，禁止在字段未提取时开发`)
    else if (!(await exists(resolve(root, feature.ui_spec)))) failures.push(`${feature.id} 的页面字段规格不可达：${feature.ui_spec}`)
    if (!feature.plan) failures.push(`${feature.id} 已开始但没有执行计划`)
  }
  if (feature.status === 'in_progress' && feature.plan && !feature.plan.startsWith('docs/exec-plans/active/')) failures.push(`${feature.id} 进行中但计划不在 active/`)
  if (feature.status === 'passing' && feature.plan && !feature.plan.startsWith('docs/exec-plans/completed/')) failures.push(`${feature.id} 已通过但计划未归档到 completed/`)
}

const featureById = new Map(featureList.features.map((feature) => [feature.id, feature]))
for (const feature of featureList.features) {
  for (const dependencyId of feature.depends_on ?? []) {
    const dependency = featureById.get(dependencyId)
    if (!dependency) failures.push(`${feature.id} 引用了不存在的依赖：${dependencyId}`)
    else if (['in_progress', 'passing'].includes(feature.status) && dependency.status !== 'passing') {
      failures.push(`${feature.id} 已开始但依赖 ${dependencyId} 尚未 passing`)
    }
  }
}

const visiting = new Set()
const visited = new Set()
function visitFeature(featureId, path = []) {
  if (visiting.has(featureId)) {
    failures.push(`功能依赖存在循环：${[...path, featureId].join(' -> ')}`)
    return
  }
  if (visited.has(featureId)) return
  visiting.add(featureId)
  const feature = featureById.get(featureId)
  for (const dependencyId of feature?.depends_on ?? []) visitFeature(dependencyId, [...path, featureId])
  visiting.delete(featureId)
  visited.add(featureId)
}
for (const featureId of featureById.keys()) visitFeature(featureId)

const requirementsManifest = JSON.parse(await readFile(resolve(root, 'docs/references/requirements-manifest.json'), 'utf8'))
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
  const upstreamPath = resolve(requirementsManifest.upstream_root, source.name)
  if (await exists(upstreamPath)) {
    const upstreamHash = createHash('sha256').update(await readFile(upstreamPath)).digest('hex')
    if (upstreamHash !== source.sha256) failures.push(`上游需求已变化但尚未同步评审：${source.name}`)
  }
}

const specs = requiredFiles.filter((path) => path.startsWith('docs/product-specs/') && path !== 'docs/product-specs/index.md')
for (const path of specs) {
  const contents = await readFile(resolve(root, path), 'utf8')
  if (!contents.startsWith('# ')) failures.push(`${path} 缺少一级标题`)
  if (!contents.includes('## 验收') && !contents.includes('## P0 验收') && !contents.includes('## P0/P1 验收')) {
    failures.push(`${path} 缺少验收章节`)
  }
}

const ruleRanges = { ORD: 15, PRD: 17, PUR: 10, INV: 16, CUS: 12, FIN: 11, SET: 10 }
const allSpecText = (await Promise.all(specs.map((path) => readFile(resolve(root, path), 'utf8')))).join('\n')
const assignedRules = new Set(featureList.features.flatMap((feature) => feature.rules ?? []))
for (const [prefix, max] of Object.entries(ruleRanges)) {
  for (let index = 1; index <= max; index += 1) {
    const ruleId = `${prefix}-${String(index).padStart(2, '0')}`
    if (!allSpecText.includes(ruleId)) failures.push(`业务规则未进入规格：${ruleId}`)
    if (!assignedRules.has(ruleId)) failures.push(`业务规则未分配到功能：${ruleId}`)
  }
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await walk(path)))
    else files.push(path)
  }
  return files
}

const sourceFiles = (await walk(resolve(root, 'src'))).filter((path) => /\.(vue|ts|tsx)$/.test(path))
for (const path of sourceFiles) {
  const contents = await readFile(path, 'utf8')
  const sourcePath = relative(root, path).replaceAll('\\', '/')
  if (/from\s+['"][^'"]*mock\/fixtures/.test(contents)) {
    failures.push(`View/source 不得直接导入 fixture：${relative(root, path)}`)
  }
  if (path.endsWith('.vue') && /\bv-html\s*=/.test(contents)) failures.push(`Vue 模板禁止未经专门评审使用 v-html：${sourcePath}`)
  if (/\/views?\//.test(sourcePath) && /\b(fetch|localStorage|sessionStorage)\s*[.(]/.test(contents)) {
    failures.push(`View 不得直接请求网络或访问浏览器存储：${sourcePath}`)
  }
  if (/\/services?\//.test(sourcePath) && /(Math\.random\s*\(|Date\.now\s*\(|new\s+Date\s*\(\s*\))/.test(contents)) {
    failures.push(`Service 不得使用随机数或真实当前时间决定业务结果，请注入 ID/Clock provider：${sourcePath}`)
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

const markdownFiles = (await walk(root)).filter((path) => path.endsWith('.md') && !path.includes('node_modules') && !path.includes(resolve(root, 'docs/references/requirements')))
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

console.log(`Harness 验证通过：${featureList.features.length} 个功能、${specs.length} 份领域规格、${agentLines} 行入口导航。`)
