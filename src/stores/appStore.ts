import { defineStore } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import { convertFileSrc } from '@tauri-apps/api/core'
import type { App, Category, Config, AppSettings } from '@/types'
import { DEFAULT_CONFIG } from '@/types'

// 图标目录路径缓存
let iconsDir: string | null = null

// 获取图标 URL
async function getIconUrl(iconValue: string | undefined): Promise<string | undefined> {
  if (!iconValue) return undefined

  // 如果是 base64 格式，直接返回（兼容旧数据）
  if (iconValue.startsWith('data:')) {
    return iconValue
  }

  // 如果是文件名格式，转换为本地文件 URL
  if (!iconsDir) {
    iconsDir = await invoke<string>('get_icons_dir')
    console.log('Icons directory:', iconsDir)
  }

  // 使用路径分隔符（兼容 Windows 和 Unix）
  const separator = iconsDir.includes('\\') ? '\\' : '/'
  const iconPath = `${iconsDir}${separator}${iconValue}`
  const url = convertFileSrc(iconPath)
  console.log('Icon path:', iconPath, '-> URL:', url)
  return url
}

export const useAppStore = defineStore('app', {
  state: () => ({
    config: DEFAULT_CONFIG as Config,
    currentCategory: null as string | null,
    searchQuery: '',
    loading: false,
    initialized: false,
    // 图标 URL 缓存
    iconUrlCache: {} as Record<string, string>
  }),

  getters: {
    // 获取所有分类（按 order 排序）
    categories: (state): Category[] => {
      return Object.values(state.config.categories)
        .sort((a, b) => a.order - b.order)
    },

    // 获取当前分类的应用（支持搜索过滤）
    currentApps: (state): App[] => {
      if (!state.currentCategory) return []
      const category = state.config.categories[state.currentCategory]
      if (!category) return []

      let apps = category.apps
        .map(id => state.config.apps[id])
        .filter((app): app is App => app !== undefined)

      // 搜索过滤
      if (state.searchQuery) {
        const query = state.searchQuery.toLowerCase()
        apps = apps.filter(app =>
          app.name.toLowerCase().includes(query)
        )
      }

      // 排序逻辑
      const sortBy = state.config.settings.sortBy
      if (sortBy === 'lastLaunched') {
        // 按最近使用时间排序（最近使用的在前）
        apps.sort((a, b) => {
          const aTime = a.lastLaunched || 0
          const bTime = b.lastLaunched || 0
          return bTime - aTime
        })
      } else if (sortBy === 'name') {
        // 按名称排序
        apps.sort((a, b) => a.name.localeCompare(b.name))
      }
      // sortBy === 'custom' 时保持原有顺序（category.apps 的顺序）

      return apps
    },

    settings: (state): AppSettings => state.config.settings
  },

  actions: {
    async init() {
      if (this.initialized) return
      this.loading = true
      try {
        const config = await invoke<Config>('load_config')
        this.config = config

        // 强制更新 sortBy 为 lastLaunched（确保启动的应用自动靠前）
        if (this.config.settings.sortBy !== 'lastLaunched') {
          this.config.settings.sortBy = 'lastLaunched'
          await this.saveConfig()
        }

        this.currentCategory = config.settings.lastCategory || this.categories[0]?.id || null
        this.initialized = true

        // 预加载图标 URL 缓存
        this.preloadIconUrls()
      } catch (error) {
        console.error('加载配置失败:', error)
        this.config = DEFAULT_CONFIG
      } finally {
        this.loading = false
      }
    },

    // 预加载图标 URL（异步，不阻塞）
    async preloadIconUrls() {
      for (const app of Object.values(this.config.apps)) {
        if (app.icon && !this.iconUrlCache[app.id]) {
          getIconUrl(app.icon).then(url => {
            if (url) {
              this.iconUrlCache[app.id] = url
            }
          })
        }
      }
    },

    // 获取应用图标 URL
    async getAppIconUrl(appId: string): Promise<string | undefined> {
      // 先检查缓存
      if (this.iconUrlCache[appId]) {
        return this.iconUrlCache[appId]
      }

      const app = this.config.apps[appId]
      if (!app?.icon) return undefined

      const url = await getIconUrl(app.icon)
      if (url) {
        this.iconUrlCache[appId] = url
      }
      return url
    },

    // 配置保存防抖相关
    _saveTimeout: null as number | null,
    _isDirty: false,

    // 防抖保存配置
    debouncedSaveConfig() {
      this._isDirty = true
      if (this._saveTimeout) {
        clearTimeout(this._saveTimeout)
      }
      this._saveTimeout = window.setTimeout(() => {
        this.saveConfigNow()
        this._saveTimeout = null
      }, 500)
    },

    // 立即保存配置
    async saveConfigNow() {
      try {
        await invoke('save_config', { config: this.config })
        this._isDirty = false
      } catch (error) {
        console.error('保存配置失败:', error)
      }
    },

    // 兼容旧接口
    async saveConfig() {
      await this.saveConfigNow()
    },

    async selectCategory(categoryId: string) {
      this.currentCategory = categoryId
      this.config.settings.lastCategory = categoryId
      this.debouncedSaveConfig()
    },

    async addCategory(name: string): Promise<Category> {
      const category = await invoke<Category>('add_category', { name })
      this.config.categories[category.id] = category
      if (!this.currentCategory) this.currentCategory = category.id
      await this.saveConfig()
      return category
    },

    async deleteCategory(categoryId: string) {
      const category = this.config.categories[categoryId]
      if (category) {
        category.apps.forEach(appId => delete this.config.apps[appId])
        delete this.config.categories[categoryId]
        if (this.currentCategory === categoryId) {
          this.currentCategory = this.categories[0]?.id || null
        }
        await this.saveConfig()
      }
    },

    async addApp(appData: { name: string; path: string; category: string }): Promise<App> {
      const app = await invoke<App>('add_app', {
        name: appData.name,
        path: appData.path,
        categoryId: appData.category
      })
      this.config.apps[app.id] = app
      this.config.categories[appData.category]?.apps.push(app.id)

      // 预加载新应用的图标 URL
      if (app.icon) {
        getIconUrl(app.icon).then(url => {
          if (url) {
            this.iconUrlCache[app.id] = url
          }
        })
      }

      // 初始化更新基准数据（后台静默执行，不阻塞用户操作）
      invoke('init_update_baseline', { appId: app.id }).catch(err => {
        console.warn(`初始化基准数据失败 (${app.name}):`, err)
      })

      await this.saveConfig()
      return app
    },

    async deleteApp(appId: string) {
      const app = this.config.apps[appId]
      if (app) {
        // 调用后端删除（包括删除图标文件）
        await invoke('delete_app', { appId })

        Object.values(this.config.categories).forEach(cat => {
          cat.apps = cat.apps.filter(id => id !== appId)
        })
        delete this.config.apps[appId]
        // 清除图标缓存
        delete this.iconUrlCache[appId]

        await this.saveConfig()
      }
    },

    async launchApp(appId: string) {
      await invoke('launch_app', { appId })
      const app = this.config.apps[appId]
      if (app) {
        app.lastLaunched = Date.now()
        this.debouncedSaveConfig() // 启动应用使用防抖保存
      }
    },

    setSearchQuery(query: string) {
      this.searchQuery = query
    },

    async updateSettings(settings: Partial<AppSettings>) {
      Object.assign(this.config.settings, settings)
      this.debouncedSaveConfig() // 设置更新使用防抖保存
    },

    async reorderApps(fromIndex: number, toIndex: number) {
      if (!this.currentCategory) return

      const category = this.config.categories[this.currentCategory]
      if (!category) return

      const apps = category.apps
      const [movedApp] = apps.splice(fromIndex, 1)
      apps.splice(toIndex, 0, movedApp)

      this.debouncedSaveConfig() // 重排序使用防抖保存
    },

    async reorderCategories(fromIndex: number, toIndex: number) {
      const categoryList = this.categories
      if (fromIndex < 0 || fromIndex >= categoryList.length || toIndex < 0 || toIndex >= categoryList.length) {
        return
      }

      // 获取移动的分类
      const movedCategory = categoryList[fromIndex]

      // 更新所有分类的 order
      if (fromIndex < toIndex) {
        // 向后移动
        for (let i = fromIndex + 1; i <= toIndex; i++) {
          categoryList[i].order--
        }
      } else {
        // 向前移动
        for (let i = toIndex; i < fromIndex; i++) {
          categoryList[i].order++
        }
      }

      movedCategory.order = toIndex

      this.debouncedSaveConfig() // 重排序使用防抖保存
    },

    async moveAppToCategory(appId: string, targetCategoryId: string) {
      const app = this.config.apps[appId]
      if (!app) return

      const oldCategoryId = app.category

      // 如果目标分类和当前分类相同，不做任何操作
      if (oldCategoryId === targetCategoryId) return

      // 从原分类中移除
      const oldCategory = this.config.categories[oldCategoryId]
      if (oldCategory) {
        oldCategory.apps = oldCategory.apps.filter(id => id !== appId)
      }

      // 添加到新分类
      const newCategory = this.config.categories[targetCategoryId]
      if (newCategory) {
        newCategory.apps.push(appId)
        app.category = targetCategoryId
      }

      await this.saveConfig()
    },

    // 检查应用是否已存在（根据路径）
    isAppExists(path: string): boolean {
      const normalizedPath = path.toLowerCase()
      return Object.values(this.config.apps).some(
        app => app.path.toLowerCase() === normalizedPath
      )
    }
  }
})
