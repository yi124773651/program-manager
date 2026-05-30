import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import type { App, Category, Config, ManagedItemType } from '@/types'

export interface AddAppInput {
  name: string
  path: string
  category: string
  itemType?: ManagedItemType
}

let iconsDir: string | null = null

export const configService = {
  loadConfig() {
    return invoke<Config>('load_config')
  },

  saveConfig(config: Config) {
    return invoke<void>('save_config', { config })
  },

  addCategory(name: string) {
    return invoke<Category>('add_category', { name })
  },

  addApp(appData: AddAppInput) {
    return invoke<App>('add_app', {
      name: appData.name,
      path: appData.path,
      categoryId: appData.category,
      itemType: appData.itemType
    })
  },

  deleteApp(appId: string) {
    return invoke<void>('delete_app', { appId })
  },

  launchApp(appId: string) {
    return invoke<void>('launch_app', { appId })
  },

  initUpdateBaseline(appId: string) {
    return invoke<void>('init_update_baseline', { appId })
  },

  getIconsDir() {
    if (!iconsDir) {
      return invoke<string>('get_icons_dir').then((dir) => {
        iconsDir = dir
        return dir
      })
    }
    return Promise.resolve(iconsDir)
  },

  clearIconDirCache() {
    iconsDir = null
  },

  async getIconUrl(iconValue: string | undefined): Promise<string | undefined> {
    if (!iconValue) return undefined

    // 旧版本保存的是 base64，迁移完成前仍需要直接兼容展示。
    if (iconValue.startsWith('data:')) {
      return iconValue
    }

    const dir = await this.getIconsDir()
    const separator = dir.includes('\\') ? '\\' : '/'
    return convertFileSrc(`${dir}${separator}${iconValue}`)
  },

  fetchImageAsBase64(url: string) {
    return invoke<string>('fetch_image_as_base64', { url })
  }
}
