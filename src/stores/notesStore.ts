import { defineStore } from 'pinia'
import { useAppStore } from './appStore'
import { persistenceService } from '@/services/persistenceService'

export interface QuickNote {
  id: string
  content: string
  createdAt: number
  updatedAt: number
  color: string
}

interface NotesStorage {
  notes: QuickNote[]
}

const SAVE_DEBOUNCE_DELAY = 800

const NOTE_COLORS = [
  '#fff9c4', // 黄色
  '#f8bbd9', // 粉色
  '#c8e6c9', // 绿色
  '#bbdefb', // 蓝色
  '#d7ccc8', // 棕色
  '#cfd8dc', // 灰色
]

export const useNotesStore = defineStore('notes', {
  state: () => ({
    notes: [] as QuickNote[],
    isOpen: false,
    activeNoteId: null as string | null,
    currentColorIndex: 0,
    initialized: false,
    saveTimeout: null as ReturnType<typeof setTimeout> | null,
    isDirty: false
  }),

  getters: {
    activeNote: (state): QuickNote | null => {
      if (!state.activeNoteId) return null
      return state.notes.find(n => n.id === state.activeNoteId) || null
    },

    sortedNotes: (state): QuickNote[] => {
      return [...state.notes].sort((a, b) => b.updatedAt - a.updatedAt)
    }
  },

  actions: {
    // 检查快捷便签是否启用
    isEnabled(): boolean {
      const appStore = useAppStore()
      const settings = appStore.settings
      return settings.quickerEnabled !== false && settings.quickNotesEnabled !== false
    },

    async init() {
      if (this.initialized) return
      await this.loadFromStorage()
      this.initialized = true
    },

    async loadFromStorage() {
      try {
        const data = await persistenceService.load<NotesStorage>('notes', { notes: [] })
        this.notes = data.notes || []
      } catch (error) {
        console.error('加载便签失败:', error)
      }
    },

    async saveToStorage() {
      try {
        await persistenceService.save('notes', {
          notes: this.notes
        })
        this.isDirty = false
      } catch (error) {
        console.error('保存便签失败:', error)
      }
    },

    debouncedSave() {
      this.isDirty = true
      if (this.saveTimeout) {
        clearTimeout(this.saveTimeout)
      }

      this.saveTimeout = setTimeout(() => {
        this.saveTimeout = null
        void this.saveToStorage()
      }, SAVE_DEBOUNCE_DELAY)
    },

    async flushPendingSave() {
      if (this.saveTimeout) {
        clearTimeout(this.saveTimeout)
        this.saveTimeout = null
      }

      if (this.isDirty) {
        await this.saveToStorage()
      }
    },

    open() {
      // 检查功能是否启用
      if (!this.isEnabled()) return

      this.isOpen = true
      // 如果没有便签，创建一个新的
      if (this.notes.length === 0) {
        this.addNote()
      } else if (!this.activeNoteId) {
        this.activeNoteId = this.sortedNotes[0]?.id || null
      }
    },

    async close() {
      this.isOpen = false
      await this.flushPendingSave()
    },

    async toggle() {
      if (this.isOpen) {
        await this.close()
      } else {
        this.open()
      }
    },

    addNote() {
      const note: QuickNote = {
        id: crypto.randomUUID(),
        content: '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        color: NOTE_COLORS[this.currentColorIndex % NOTE_COLORS.length]
      }
      this.currentColorIndex++
      this.notes.unshift(note)
      this.activeNoteId = note.id
      void this.saveToStorage()
    },

    updateNote(id: string, content: string) {
      const note = this.notes.find(n => n.id === id)
      if (note) {
        note.content = content
        note.updatedAt = Date.now()
        this.debouncedSave()
      }
    },

    deleteNote(id: string) {
      const index = this.notes.findIndex(n => n.id === id)
      if (index !== -1) {
        this.notes.splice(index, 1)
        // 如果删除的是当前活动便签，切换到下一个
        if (this.activeNoteId === id) {
          this.activeNoteId = this.notes[0]?.id || null
        }
        void this.saveToStorage()
      }
    },

    selectNote(id: string) {
      this.activeNoteId = id
    },

    changeColor(id: string, color: string) {
      const note = this.notes.find(n => n.id === id)
      if (note) {
        note.color = color
        void this.saveToStorage()
      }
    }
  }
})

export { NOTE_COLORS }
