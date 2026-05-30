import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()

const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const tauriConf = JSON.parse(readFileSync(resolve(root, 'src-tauri/tauri.conf.json'), 'utf8'))
const cargoToml = readFileSync(resolve(root, 'src-tauri/Cargo.toml'), 'utf8')
const cargoVersion = cargoToml.match(/^version\s*=\s*"([^"]+)"/m)?.[1]

const versions = {
  'package.json': packageJson.version,
  'src-tauri/Cargo.toml': cargoVersion,
  'src-tauri/tauri.conf.json': tauriConf.version
}

const uniqueVersions = new Set(Object.values(versions))

if (uniqueVersions.size !== 1) {
  console.error('应用发布版本不一致：')
  for (const [file, version] of Object.entries(versions)) {
    console.error(`- ${file}: ${version ?? '未找到'}`)
  }
  process.exit(1)
}

console.log(`应用发布版本一致：${packageJson.version}`)
