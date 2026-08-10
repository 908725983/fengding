import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const root = resolve(scriptDirectory, '..')
const source = resolve(root, 'mock/fixtures/baseline.json')
const targetDirectory = resolve(root, 'work')
const target = resolve(targetDirectory, 'mock-state.json')

await mkdir(targetDirectory, { recursive: true })
await copyFile(source, target)

console.log('Mock 状态已恢复为 baseline。')
