import { defineStore } from 'pinia'
import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager'
import type { ClipboardItem } from '@/types'
import { useAppStore } from './appStore'

export const useClipboardStore = defineStore('clipboard', {
  state: () => ({
    items: [] as ClipboardItem[],
    searchQuery: '',
    isMonitoring: true,
    lastContent: '',
    pollingInterval: null as number | null,
    maxItems: 100
  }),

  getters: {
    filteredItems: (state): ClipboardItem[] => {
      if (!state.searchQuery) {
        return state.items
      }
      const query = state.searchQuery.toLowerCase()
      return state.items.filter(item =>
        item.content.toLowerCase().includes(query) ||
        item.preview?.toLowerCase().includes(query)
      )
    },

    pinnedItems: (state): ClipboardItem[] => {
      return state.items.filter(item => item.pinned)
    },

    recentItems: (state): ClipboardItem[] => {
      return state.items.filter(item => !item.pinned).slice(0, 20)
    },

    // 检查剪贴板历史功能是否启用
    isEnabled(): boolean {
      const appStore = useAppStore()
      const settings = appStore.settings
      return settings.quickerEnabled !== false && settings.clipboardHistoryEnabled !== false
    }
  },

  actions: {
    async init() {
      // 从本地存储加载历史
      this.loadFromStorage()
      // 仅在功能启用时开始监控剪贴板
      if (this.isEnabled) {
        this.startMonitoring()
      }
    },

    loadFromStorage() {
      try {
        const stored = localStorage.getItem('clipboard_history')
        if (stored) {
          const data = JSON.parse(stored)
          this.items = data.items || []
          this.maxItems = data.maxItems || 100
        }
      } catch (error) {
        console.error('加载剪贴板历史失败:', error)
      }
    },

    saveToStorage() {
      try {
        localStorage.setItem('clipboard_history', JSON.stringify({
          items: this.items,
          maxItems: this.maxItems
        }))
      } catch (error) {
        console.error('保存剪贴板历史失败:', error)
      }
    },

    startMonitoring() {
      if (this.pollingInterval) return

      // 每 500ms 检查一次剪贴板变化
      this.pollingInterval = window.setInterval(async () => {
        if (!this.isMonitoring) return

        try {
          const content = await readText()
          if (content && content !== this.lastContent && content.trim()) {
            this.lastContent = content
            await this.addItem(content)
          }
        } catch (error) {
          // 剪贴板可能为空或不可读，忽略错误
        }
      }, 500)
    },

    stopMonitoring() {
      if (this.pollingInterval) {
        clearInterval(this.pollingInterval)
        this.pollingInterval = null
      }
    },

    async addItem(content: string) {
      // 检查是否已存在
      const existingIndex = this.items.findIndex(item => item.content === content)
      if (existingIndex !== -1) {
        // 已存在，移到顶部并更新时间
        const [existing] = this.items.splice(existingIndex, 1)
        existing.createdAt = Date.now()
        this.items.unshift(existing)
        this.saveToStorage()
        return
      }

      // 创建新项
      const preview = content.length > 100
        ? content.slice(0, 100) + '...'
        : undefined

      const item: ClipboardItem = {
        id: crypto.randomUUID(),
        content,
        contentType: 'text',
        createdAt: Date.now(),
        preview,
        pinned: false
      }

      // 添加到开头
      this.items.unshift(item)

      // 移除超过限制的非置顶项
      const pinnedCount = this.items.filter(i => i.pinned).length
      while (this.items.length > this.maxItems + pinnedCount) {
        // 从后往前查找第一个非置顶项
        let lastNonPinnedIndex = -1
        for (let i = this.items.length - 1; i >= 0; i--) {
          if (!this.items[i].pinned) {
            lastNonPinnedIndex = i
            break
          }
        }
        if (lastNonPinnedIndex !== -1) {
          this.items.splice(lastNonPinnedIndex, 1)
        } else {
          break
        }
      }

      this.saveToStorage()
    },

    deleteItem(id: string) {
      this.items = this.items.filter(item => item.id !== id)
      this.saveToStorage()
    },

    clearHistory() {
      // 保留置顶项
      this.items = this.items.filter(item => item.pinned)
      this.saveToStorage()
    },

    togglePin(id: string) {
      const item = this.items.find(i => i.id === id)
      if (item) {
        item.pinned = !item.pinned
        this.saveToStorage()
      }
    },

    async pasteItem(id: string) {
      const item = this.items.find(i => i.id === id)
      if (item) {
        try {
          await writeText(item.content)
          // 更新最后内容，避免重复添加
          this.lastContent = item.content
        } catch (error) {
          console.error('写入剪贴板失败:', error)
        }
      }
    },

    setSearchQuery(query: string) {
      this.searchQuery = query
    },

    toggleMonitoring() {
      this.isMonitoring = !this.isMonitoring
    }
  }
})
