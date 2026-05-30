import { defineStore } from 'pinia'
import { useAppStore } from './appStore'
import type { SearchResult, SearchResultType } from '@/types/search'
import { searchService } from '@/services/searchService'

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
        scene: [],
        note: [],
        todo: [],
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

      try {
        this.results = await searchService.search(query)
      } catch (error) {
        console.error('搜索失败:', error)
        this.results = []
      } finally {
        this.isLoading = false
      }
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
      try {
        await searchService.executeResult(result)
      } catch (error) {
        console.error('执行搜索结果失败:', error)
      }
    }
  }
})
