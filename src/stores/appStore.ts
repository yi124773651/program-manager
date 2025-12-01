import { defineStore } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import type { App, Category, Config, AppSettings } from '@/types'
import { DEFAULT_CONFIG } from '@/types'

export const useAppStore = defineStore('app', {
  state: () => ({
    config: DEFAULT_CONFIG as Config,
    currentCategory: null as string | null,
    searchQuery: '',
    loading: false,
    initialized: false
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
      } catch (error) {
        console.error('加载配置失败:', error)
        this.config = DEFAULT_CONFIG
      } finally {
        this.loading = false
      }
    },

    async saveConfig() {
      try {
        await invoke('save_config', { config: this.config })
      } catch (error) {
        console.error('保存配置失败:', error)
      }
    },

    async selectCategory(categoryId: string) {
      this.currentCategory = categoryId
      this.config.settings.lastCategory = categoryId
      await this.saveConfig()
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
      await this.saveConfig()
      return app
    },

    async deleteApp(appId: string) {
      const app = this.config.apps[appId]
      if (app) {
        Object.values(this.config.categories).forEach(cat => {
          cat.apps = cat.apps.filter(id => id !== appId)
        })
        delete this.config.apps[appId]
        await this.saveConfig()
      }
    },

    async launchApp(appId: string) {
      await invoke('launch_app', { appId })
      const app = this.config.apps[appId]
      if (app) {
        app.lastLaunched = Date.now()
        await this.saveConfig()
      }
    },

    setSearchQuery(query: string) {
      this.searchQuery = query
    },

    async updateSettings(settings: Partial<AppSettings>) {
      Object.assign(this.config.settings, settings)
      await this.saveConfig()
    },

    async reorderApps(fromIndex: number, toIndex: number) {
      if (!this.currentCategory) return

      const category = this.config.categories[this.currentCategory]
      if (!category) return

      const apps = category.apps
      const [movedApp] = apps.splice(fromIndex, 1)
      apps.splice(toIndex, 0, movedApp)

      await this.saveConfig()
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

      await this.saveConfig()
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
