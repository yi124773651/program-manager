import { defineStore } from 'pinia'
import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager'
import type { ClipboardItem } from '@/types'
import { useAppStore } from './appStore'
import { watch } from 'vue'

// 剪贴板内容最大长度限制（10KB）
const MAX_CONTENT_LENGTH = 10 * 1024

// 防抖保存延迟（ms）
const SAVE_DEBOUNCE_DELAY = 1000

// 轮询间隔（ms）- 从 500ms 优化到 1200ms
const POLLING_INTERVAL = 1200

export const useClipboardStore = defineStore('clipboard', {
  state: () => ({
    items: [] as ClipboardItem[],
    searchQuery: '',
    isMonitoring: true,
    lastContent: '',
    pollingInterval: null as number | null,
    maxItems: 100,
    settingsWatcherSetup: false,
    // 防抖保存相关
    saveTimeout: null as number | null,
    isDirty: false
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

      // 设置设置变化监听器（只设置一次）
      if (!this.settingsWatcherSetup) {
        this.settingsWatcherSetup = true
        this.setupSettingsWatcher()
      }
    },

    // 监听设置变化，动态启停剪贴板监控
    setupSettingsWatcher() {
      const appStore = useAppStore()
      watch(
        () => [appStore.settings.quickerEnabled, appStore.settings.clipboardHistoryEnabled],
        () => {
          if (this.isEnabled) {
            this.startMonitoring()
          } else {
            this.stopMonitoring()
          }
        }
      )
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
        this.isDirty = false
      } catch (error) {
        console.error('保存剪贴板历史失败:', error)
      }
    },

    // 防抖保存 - 避免频繁写入 localStorage
    debouncedSave() {
      this.isDirty = true
      if (this.saveTimeout) {
        clearTimeout(this.saveTimeout)
      }
      this.saveTimeout = window.setTimeout(() => {
        this.saveToStorage()
        this.saveTimeout = null
      }, SAVE_DEBOUNCE_DELAY)
    },

    // 立即保存（用于重要操作如删除、清空）
    saveNow() {
      if (this.saveTimeout) {
        clearTimeout(this.saveTimeout)
        this.saveTimeout = null
      }
      this.saveToStorage()
    },

    startMonitoring() {
      if (this.pollingInterval) return

      // 优化后的轮询间隔
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
      }, POLLING_INTERVAL)
    },

    stopMonitoring() {
      if (this.pollingInterval) {
        clearInterval(this.pollingInterval)
        this.pollingInterval = null
      }
      // 停止监控时，如果有未保存的数据，立即保存
      if (this.isDirty) {
        this.saveNow()
      }
    },

    async addItem(content: string) {
      // 内容长度限制
      if (content.length > MAX_CONTENT_LENGTH) {
        console.log('剪贴板内容超过长度限制，跳过')
        return
      }

      // 检查是否已存在
      const existingIndex = this.items.findIndex(item => item.content === content)
      if (existingIndex !== -1) {
        // 已存在，移到顶部并更新时间
        const [existing] = this.items.splice(existingIndex, 1)
        existing.createdAt = Date.now()
        this.items.unshift(existing)
        this.debouncedSave()
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

      this.debouncedSave()
    },

    deleteItem(id: string) {
      this.items = this.items.filter(item => item.id !== id)
      this.saveNow() // 删除操作立即保存
    },

    clearHistory() {
      // 保留置顶项
      this.items = this.items.filter(item => item.pinned)
      this.saveNow() // 清空操作立即保存
    },

    togglePin(id: string) {
      const item = this.items.find(i => i.id === id)
      if (item) {
        item.pinned = !item.pinned
        this.debouncedSave()
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
