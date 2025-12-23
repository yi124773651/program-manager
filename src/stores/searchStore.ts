import { defineStore } from 'pinia'
import { useAppStore } from './appStore'
import { useClipboardStore } from './clipboardStore'
import type { SearchResult, SearchResultType } from '@/types/search'
import { DEFAULT_SEARCH_ENGINES } from '@/types/search'
import type { Config } from '@/types'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-shell'
import { writeText } from '@tauri-apps/plugin-clipboard-manager'

// 搜索防抖延迟（ms）
const SEARCH_DEBOUNCE_DELAY = 150

export const useSearchStore = defineStore('search', {
  state: () => ({
    query: '',
    isOpen: false,
    results: [] as SearchResult[],
    selectedIndex: 0,
    isLoading: false,
    defaultSearchEngine: 'baidu',
    // 搜索防抖相关
    searchTimeout: null as number | null
  }),

  getters: {
    hasResults: (state): boolean => state.results.length > 0,

    selectedResult: (state): SearchResult | null => {
      if (state.results.length === 0) return null
      return state.results[state.selectedIndex] || null
    },

    groupedResults: (state): Record<SearchResultType, SearchResult[]> => {
      const groups: Record<SearchResultType, SearchResult[]> = {
        calculator: [],
        app: [],
        clipboard: [],
        web: []
      }
      for (const result of state.results) {
        groups[result.type].push(result)
      }
      return groups
    }
  },

  actions: {
    // 检查快捷搜索是否启用
    isEnabled(): boolean {
      const appStore = useAppStore()
      const settings = appStore.settings
      return settings.quickerEnabled !== false && settings.spotlightSearchEnabled !== false
    },

    open() {
      // 检查功能是否启用
      if (!this.isEnabled()) return

      this.isOpen = true
      this.query = ''
      this.results = []
      this.selectedIndex = 0
    },

    close() {
      this.isOpen = false
      this.query = ''
      this.results = []
      this.selectedIndex = 0
    },

    toggle() {
      if (this.isOpen) {
        this.close()
      } else {
        this.open()
      }
    },

    // 带防抖的搜索（供外部调用）
    debouncedSearch(query: string) {
      this.query = query

      if (!query.trim()) {
        this.results = []
        this.selectedIndex = 0
        if (this.searchTimeout) {
          clearTimeout(this.searchTimeout)
          this.searchTimeout = null
        }
        return
      }

      // 清除之前的定时器
      if (this.searchTimeout) {
        clearTimeout(this.searchTimeout)
      }

      // 设置新的定时器
      this.searchTimeout = window.setTimeout(() => {
        this.performSearch(query)
        this.searchTimeout = null
      }, SEARCH_DEBOUNCE_DELAY)
    },

    // 立即搜索（不防抖，用于特殊场景）
    async search(query: string) {
      this.query = query
      this.selectedIndex = 0

      if (!query.trim()) {
        this.results = []
        return
      }

      await this.performSearch(query)
    },

    // 实际执行搜索的内部方法
    async performSearch(query: string) {
      this.selectedIndex = 0
      this.isLoading = true
      const appStore = useAppStore()

      // 强制重新加载配置以获取最新设置（解决独立窗口配置不同步问题）
      if (appStore.initialized) {
        try {
          const config = await invoke<Config>('load_config')
          appStore.config = config
        } catch (error) {
          console.error('刷新配置失败:', error)
        }
      }

      const settings = appStore.settings

      try {
        const results: SearchResult[] = []

        // 检查是否是计算表达式 (以 = 开头)
        if (query.startsWith('=') && settings.calculatorEnabled !== false) {
          const expression = query.slice(1).trim()
          if (expression) {
            const calcResult = this.evaluateExpression(expression)
            if (calcResult !== null) {
              results.push(calcResult)
            }
          }
        }
        // 检查是否是命令前缀
        else if (query.startsWith('/')) {
          // 网页搜索
          const searchQuery = query.slice(1).trim()
          if (searchQuery) {
            results.push(...this.getWebSearchResults(searchQuery))
          }
        } else if (query.startsWith('c:')) {
          // 剪贴板搜索 - 检查剪贴板历史功能是否启用
          if (settings.clipboardHistoryEnabled !== false) {
            const searchQuery = query.slice(2).trim()
            results.push(...this.searchClipboard(searchQuery))
          }
        } else {
          // 默认：搜索应用 + 剪贴板 + 网页建议
          results.push(...this.searchApps(query))
          // 只有在剪贴板历史启用时才搜索剪贴板
          if (settings.clipboardHistoryEnabled !== false) {
            results.push(...this.searchClipboard(query).slice(0, 3))
          }
          results.push(...this.getWebSearchResults(query).slice(0, 1))
        }

        this.results = results
      } catch (error) {
        console.error('搜索失败:', error)
        this.results = []
      } finally {
        this.isLoading = false
      }
    },

    // 计算表达式
    evaluateExpression(expression: string): SearchResult | null {
      try {
        // 安全的数学表达式计算
        // 只允许数字、运算符、括号、小数点和空格
        const sanitized = expression.replace(/\s/g, '')
        if (!/^[\d+\-*/().%^]+$/.test(sanitized)) {
          return null
        }

        // 替换 ^ 为 ** (幂运算)
        const jsExpression = sanitized.replace(/\^/g, '**')

        // 使用 Function 构造器进行计算（比 eval 更安全）
        const result = new Function(`return (${jsExpression})`)()

        if (typeof result === 'number' && !isNaN(result) && isFinite(result)) {
          // 格式化结果
          const formattedResult = Number.isInteger(result)
            ? result.toString()
            : result.toFixed(10).replace(/\.?0+$/, '')

          return {
            id: 'calculator-result',
            type: 'calculator',
            title: formattedResult,
            subtitle: `${expression} = ${formattedResult}（回车复制结果）`,
            data: { expression, result: formattedResult }
          }
        }
      } catch (error) {
        // 表达式无效，返回 null
      }
      return null
    },

    searchApps(query: string): SearchResult[] {
      const appStore = useAppStore()
      const lowerQuery = query.toLowerCase()

      const results: SearchResult[] = []

      for (const app of Object.values(appStore.config.apps)) {
        if (app.name.toLowerCase().includes(lowerQuery) ||
            app.path.toLowerCase().includes(lowerQuery)) {
          // 使用缓存的图标 URL，而不是原始的 icon 值（可能是文件名）
          const iconUrl = appStore.iconUrlCache[app.id] || (app.icon?.startsWith('data:') ? app.icon : undefined)
          results.push({
            id: `app-${app.id}`,
            type: 'app',
            title: app.name,
            subtitle: app.path,
            icon: iconUrl,
            data: app
          })
        }
      }

      // 按名称匹配度排序
      results.sort((a, b) => {
        const aStartsWith = a.title.toLowerCase().startsWith(lowerQuery)
        const bStartsWith = b.title.toLowerCase().startsWith(lowerQuery)
        if (aStartsWith && !bStartsWith) return -1
        if (!aStartsWith && bStartsWith) return 1
        return a.title.localeCompare(b.title)
      })

      return results.slice(0, 10)
    },

    searchClipboard(query: string): SearchResult[] {
      const clipboardStore = useClipboardStore()
      const lowerQuery = query.toLowerCase()

      const results: SearchResult[] = []

      for (const item of clipboardStore.items) {
        if (item.content.toLowerCase().includes(lowerQuery)) {
          results.push({
            id: `clipboard-${item.id}`,
            type: 'clipboard',
            title: item.preview || item.content.slice(0, 50),
            subtitle: new Date(item.createdAt).toLocaleString(),
            data: item
          })
        }
      }

      return results.slice(0, 10)
    },

    getWebSearchResults(query: string): SearchResult[] {
      return DEFAULT_SEARCH_ENGINES.map(engine => ({
        id: `web-${engine.id}`,
        type: 'web' as SearchResultType,
        title: `在 ${engine.name} 中搜索`,
        subtitle: query,
        data: { engine, query }
      }))
    },

    selectNext() {
      if (this.results.length === 0) return
      this.selectedIndex = (this.selectedIndex + 1) % this.results.length
    },

    selectPrev() {
      if (this.results.length === 0) return
      this.selectedIndex = this.selectedIndex === 0
        ? this.results.length - 1
        : this.selectedIndex - 1
    },

    selectIndex(index: number) {
      if (index >= 0 && index < this.results.length) {
        this.selectedIndex = index
      }
    },

    async executeSelected() {
      const result = this.selectedResult
      if (!result) return

      await this.executeResult(result)
      this.close()
    },

    async executeResult(result: SearchResult) {
      switch (result.type) {
        case 'app':
          try {
            await invoke('launch_app', { appId: result.data.id })
          } catch (error) {
            console.error('启动应用失败:', error)
          }
          break

        case 'clipboard':
          const clipboardStore = useClipboardStore()
          await clipboardStore.pasteItem(result.data.id)
          break

        case 'web':
          const { engine, query } = result.data
          const url = engine.urlTemplate.replace('{query}', encodeURIComponent(query))
          try {
            await open(url)
          } catch (error) {
            console.error('打开网页失败:', error)
          }
          break

        case 'calculator':
          // 复制计算结果到剪贴板
          try {
            await writeText(result.data.result)
          } catch (error) {
            console.error('复制计算结果失败:', error)
          }
          break
      }
    }
  }
})
