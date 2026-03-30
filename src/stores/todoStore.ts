import { defineStore } from 'pinia'
import type { TodoInput, TodoItem } from '@/types/todo'
import { getTodayDateKey } from '@/types/todo'

const STORAGE_KEY = 'todo_schedule'
type StoredTodoItem = Partial<TodoItem> & {
  time?: string
}

const normalizeTodoItem = (item: StoredTodoItem): TodoItem => ({
  id: item.id ?? crypto.randomUUID(),
  title: item.title?.trim() ?? '',
  date: item.date ?? getTodayDateKey(),
  startTime: item.startTime || item.time || undefined,
  endTime: item.endTime || undefined,
  description: item.description?.trim() ?? '',
  completed: item.completed ?? false,
  createdAt: item.createdAt ?? Date.now(),
  updatedAt: item.updatedAt ?? Date.now(),
  completedAt: item.completedAt
})

const compareBySchedule = (a: TodoItem, b: TodoItem) => {
  if (a.date !== b.date) {
    return a.date.localeCompare(b.date)
  }

  if (a.startTime && b.startTime) {
    return a.startTime.localeCompare(b.startTime)
  }

  if (a.startTime && !b.startTime) return -1
  if (!a.startTime && b.startTime) return 1
  return a.updatedAt - b.updatedAt
}

export const useTodoStore = defineStore('todoSchedule', {
  state: () => ({
    items: [] as TodoItem[],
    selectedDate: getTodayDateKey(),
    initialized: false
  }),

  getters: {
    overdueTodos: (state) => state.items
      .filter((item) => !item.completed && item.date < state.selectedDate)
      .sort(compareBySchedule),

    selectedDateTodos: (state) => state.items
      .filter((item) => !item.completed && item.date === state.selectedDate)
      .sort(compareBySchedule),

    completedTodos: (state) => state.items
      .filter((item) => item.completed)
      .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
  },

  actions: {
    init() {
      if (this.initialized) return
      this.selectedDate = getTodayDateKey()
      this.loadFromStorage()
      this.initialized = true
    },

    loadFromStorage() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return
        const parsed = JSON.parse(raw) as { items?: StoredTodoItem[] }
        this.items = (parsed.items ?? []).map(normalizeTodoItem)
      } catch (error) {
        console.error('加载待办事项失败:', error)
        this.items = []
      }
    },

    saveToStorage() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ items: this.items }))
    },

    setSelectedDate(date: string) {
      this.selectedDate = date
    },

    addTodo(input: TodoInput) {
      const now = Date.now()
      this.items.unshift({
        id: crypto.randomUUID(),
        title: input.title.trim(),
        date: input.date,
        startTime: input.startTime || undefined,
        endTime: input.endTime || undefined,
        description: input.description?.trim() ?? '',
        completed: false,
        createdAt: now,
        updatedAt: now
      })
      this.saveToStorage()
    },

    updateTodo(id: string, patch: Partial<TodoInput>) {
      const target = this.items.find((item) => item.id === id)
      if (!target) return

      target.title = patch.title?.trim() ?? target.title
      target.date = patch.date ?? target.date
      target.startTime = patch.startTime || undefined
      target.endTime = patch.endTime || undefined
      target.description = patch.description?.trim() ?? target.description
      target.updatedAt = Date.now()
      this.saveToStorage()
    },

    toggleTodo(id: string) {
      const target = this.items.find((item) => item.id === id)
      if (!target) return

      target.completed = !target.completed
      target.completedAt = target.completed ? Date.now() : undefined
      target.updatedAt = Date.now()
      this.saveToStorage()
    },

    deleteTodo(id: string) {
      this.items = this.items.filter((item) => item.id !== id)
      this.saveToStorage()
    },

    clearBeforeToday() {
      const today = getTodayDateKey()
      const beforeCount = this.items.length
      this.items = this.items.filter((item) => item.date >= today)
      const clearedCount = beforeCount - this.items.length

      if (clearedCount > 0) {
        this.saveToStorage()
      }

      return clearedCount
    }
  }
})
