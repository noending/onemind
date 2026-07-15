import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const MAX_MAIN_PACKAGE_BYTES = 2 * 1024 * 1024
const toolsDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(toolsDir, '..')
const projectConfig = JSON.parse(
  await readFile(path.join(projectRoot, 'project.config.json'), 'utf8')
)

const ignoredFolders = new Set(
  projectConfig.packOptions?.ignore
    ?.filter(({ type }) => type === 'folder')
    .map(({ value }) => value.replace(/^\.\//, '').replace(/\/$/, '')) ?? []
)
const ignoredFiles = new Set(
  projectConfig.packOptions?.ignore
    ?.filter(({ type }) => type === 'file')
    .map(({ value }) => value.replace(/^\.\//, '')) ?? []
)

// Developer Tools excludes repository metadata and project settings from the uploaded package.
const implicitIgnoredFolders = new Set(['.git'])
const implicitIgnoredFiles = new Set([
  '.DS_Store',
  'project.config.json',
  'project.private.config.json',
  'project.miniapp.json'
])
const includedFiles = []

async function collect(directory, relativeDirectory = '') {
  const entries = await readdir(directory, { withFileTypes: true })

  for (const entry of entries) {
    const relativePath = path.posix.join(relativeDirectory, entry.name)

    if (entry.isDirectory()) {
      if (ignoredFolders.has(relativePath) || implicitIgnoredFolders.has(relativePath)) continue
      await collect(path.join(directory, entry.name), relativePath)
      continue
    }

    if (ignoredFiles.has(relativePath) || implicitIgnoredFiles.has(relativePath)) continue
    const fileStat = await stat(path.join(directory, entry.name))
    includedFiles.push({ path: relativePath, size: fileStat.size })
  }
}

await collect(projectRoot)

const totalBytes = includedFiles.reduce((sum, file) => sum + file.size, 0)
const largestFiles = includedFiles.sort((a, b) => b.size - a.size).slice(0, 8)
const formatSize = bytes => `${(bytes / 1024 / 1024).toFixed(2)} MB`

console.log(`Estimated main package: ${formatSize(totalBytes)} / ${formatSize(MAX_MAIN_PACKAGE_BYTES)}`)
console.log('Largest included files:')
for (const file of largestFiles) {
  console.log(`  ${formatSize(file.size).padStart(8)}  ${file.path}`)
}

if (totalBytes > MAX_MAIN_PACKAGE_BYTES) {
  console.error(`Package exceeds the WeChat 2 MB main-package limit by ${formatSize(totalBytes - MAX_MAIN_PACKAGE_BYTES)}.`)
  process.exitCode = 1
}
