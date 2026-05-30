import { defineStore } from 'pinia'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { App, Category, Config, AppSettings, ManagedItemType } from '@/types'
import { DEFAULT_CONFIG, canCheckForUpdates } from '@/types'
import { configService } from '@/services/configService'

let configChangedUnlisten: UnlistenFn | null = null

export const useAppStore = defineStore('app', {
  state: () => ({
    config: DEFAULT_CONFIG as Config,
    currentCategory: null as string | null,
    searchQuery: '',
    loading: false,
    initialized: false,
    lastSaveError: null as string | null,
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
      await this.loadConfig()
      await this.setupConfigChangedListener()
    },

    // 重新加载配置（强制从后端读取最新数据）
    async reloadConfig() {
      await this.loadConfig()
    },

    async loadConfig() {
      this.loading = true
      try {
        const config = await configService.loadConfig()
        this.applyConfig(config)

        // 强制更新 sortBy 为 lastLaunched（确保启动的应用自动靠前）
        if (this.config.settings.sortBy !== 'lastLaunched') {
          this.config.settings.sortBy = 'lastLaunched'
          await this.saveConfig()
        }
        this.initialized = true
      } catch (error) {
        console.error('加载配置失败:', error)
        this.config = DEFAULT_CONFIG
      } finally {
        this.loading = false
      }
    },

    applyConfig(config: Config) {
      this.config = config
      this.currentCategory = config.settings.lastCategory || this.categories[0]?.id || null

      // 配置变化可能包含图标文件名迁移或应用变更，需要重建缓存。
      this.iconUrlCache = {}
      this.preloadIconUrls()
    },

    async setupConfigChangedListener() {
      if (configChangedUnlisten) return

      configChangedUnlisten = await listen<Config>('config-changed', (event) => {
        this.applyConfig(event.payload)
      })
    },

    // 预加载图标 URL（异步，不阻塞）
    async preloadIconUrls() {
      for (const app of Object.values(this.config.apps)) {
        if (app.icon && !this.iconUrlCache[app.id]) {
          configService.getIconUrl(app.icon).then(url => {
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

      const url = await configService.getIconUrl(app.icon)
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

    // 立即保存配置；快捷键设置需要拿到错误以展示注册失败，其余高频路径保持静默记录。
    async saveConfigNow(options: { throwOnError?: boolean } = {}) {
      try {
        await configService.saveConfig(this.config)
        this._isDirty = false
        this.lastSaveError = null
      } catch (error) {
        console.error('保存配置失败:', error)
        this.lastSaveError = String(error)
        if (options.throwOnError) {
          throw error
        }
      }
    },

    // 兼容旧接口
    async saveConfig(options: { throwOnError?: boolean } = {}) {
      if (this._saveTimeout) {
        clearTimeout(this._saveTimeout)
        this._saveTimeout = null
      }

      await this.saveConfigNow(options)
    },

    async flushPendingSave() {
      if (this._saveTimeout) {
        clearTimeout(this._saveTimeout)
        this._saveTimeout = null
      }

      if (this._isDirty) {
        await this.saveConfigNow()
      }
    },

    async selectCategory(categoryId: string) {
      this.currentCategory = categoryId
      this.config.settings.lastCategory = categoryId
      this.debouncedSaveConfig()
    },

    async addCategory(name: string): Promise<Category> {
      const category = await configService.addCategory(name)
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

    async addApp(appData: { name: string; path: string; category: string; itemType?: ManagedItemType }): Promise<App> {
      const app = await configService.addApp(appData)
      this.config.apps[app.id] = app
      this.config.categories[appData.category]?.apps.push(app.id)

      // 预加载新应用的图标 URL
      if (app.icon) {
        configService.getIconUrl(app.icon).then(url => {
          if (url) {
            this.iconUrlCache[app.id] = url
          }
        })
      }

      // 只有可执行程序才参与更新基准初始化
      if (canCheckForUpdates(app.itemType)) {
        configService.initUpdateBaseline(app.id).catch(err => {
          console.warn(`初始化基准数据失败 (${app.name}):`, err)
        })
      }

      await this.saveConfig()
      return app
    },

    async deleteApp(appId: string) {
      const app = this.config.apps[appId]
      if (app) {
        // 调用后端删除（包括删除图标文件）
        await configService.deleteApp(appId)

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
      await configService.launchApp(appId)
      const app = this.config.apps[appId]
      if (app) {
        app.lastLaunched = Date.now()
        this.debouncedSaveConfig() // 启动应用使用防抖保存
      }
    },

    setSearchQuery(query: string) {
      this.searchQuery = query
    },

    async updateSettings(settings: Partial<AppSettings>, options: { immediate?: boolean } = {}) {
      Object.assign(this.config.settings, settings)
      if (options.immediate) {
        await this.saveConfig({ throwOnError: true })
        return
      }
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
    },

    // 从随机图床加载背景图片
    async loadApiBackground(): Promise<boolean> {
      const url = this.config.settings.backgroundApiUrl
      if (!url) return false

      try {
        const dataUrl = await configService.fetchImageAsBase64(url)
        this.config.settings.backgroundImage = dataUrl
        this.debouncedSaveConfig()
        return true
      } catch (error) {
        console.error('加载图床背景图片失败:', error)
        return false
      }
    }
  }
})
