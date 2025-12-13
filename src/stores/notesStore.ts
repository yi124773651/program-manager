import { defineStore } from 'pinia'

export interface QuickNote {
  id: string
  content: string
  createdAt: number
  updatedAt: number
  color: string
}

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
    currentColorIndex: 0
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
    init() {
      this.loadFromStorage()
    },

    loadFromStorage() {
      try {
        const stored = localStorage.getItem('quick_notes')
        if (stored) {
          const data = JSON.parse(stored)
          this.notes = data.notes || []
        }
      } catch (error) {
        console.error('加载便签失败:', error)
      }
    },

    saveToStorage() {
      try {
        localStorage.setItem('quick_notes', JSON.stringify({
          notes: this.notes
        }))
      } catch (error) {
        console.error('保存便签失败:', error)
      }
    },

    open() {
      this.isOpen = true
      // 如果没有便签，创建一个新的
      if (this.notes.length === 0) {
        this.addNote()
      } else if (!this.activeNoteId) {
        this.activeNoteId = this.sortedNotes[0]?.id || null
      }
    },

    close() {
      this.isOpen = false
    },

    toggle() {
      if (this.isOpen) {
        this.close()
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
      this.saveToStorage()
    },

    updateNote(id: string, content: string) {
      const note = this.notes.find(n => n.id === id)
      if (note) {
        note.content = content
        note.updatedAt = Date.now()
        this.saveToStorage()
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
        this.saveToStorage()
      }
    },

    selectNote(id: string) {
      this.activeNoteId = id
    },

    changeColor(id: string, color: string) {
      const note = this.notes.find(n => n.id === id)
      if (note) {
        note.color = color
        this.saveToStorage()
      }
    }
  }
})

export { NOTE_COLORS }
