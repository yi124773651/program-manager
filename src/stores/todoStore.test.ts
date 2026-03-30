import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTodoStore } from './todoStore'
import type { TodoItem } from '@/types/todo'

const storage: Record<string, string> = {}

const localStorageMock = {
  getItem: vi.fn((key: string) => storage[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    storage[key] = value
  }),
  removeItem: vi.fn((key: string) => {
    delete storage[key]
  })
}

const makeTodo = (overrides: Partial<TodoItem>): TodoItem => ({
  id: overrides.id ?? crypto.randomUUID(),
  title: overrides.title ?? '默认事项',
  date: overrides.date ?? '2026-03-30',
  startTime: overrides.startTime,
  endTime: overrides.endTime,
  description: overrides.description ?? '',
  completed: overrides.completed ?? false,
  createdAt: overrides.createdAt ?? 100,
  updatedAt: overrides.updatedAt ?? 100,
  completedAt: overrides.completedAt
})

describe('useTodoStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    Object.keys(storage).forEach((key) => delete storage[key])
    vi.stubGlobal('localStorage', localStorageMock)
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-30T09:00:00'))
  })

  it('初始化时默认选择今天，并从本地存储恢复事项', () => {
    storage.todo_schedule = JSON.stringify({
      items: [{ ...makeTodo({ id: 'saved', title: '已保存事项' }), time: '08:00' }]
    })

    const store = useTodoStore()
    store.init()

    expect(store.selectedDate).toBe('2026-03-30')
    expect(store.items).toHaveLength(1)
    expect(store.items[0].id).toBe('saved')
    expect(store.items[0].startTime).toBe('08:00')
    expect(store.items[0].endTime).toBeUndefined()
    expect(store.items[0].description).toBe('')
  })

  it('会把逾期事项和所选日期事项按规则分组排序', () => {
    const store = useTodoStore()
    store.items = [
      makeTodo({ id: 'overdue-2', date: '2026-03-28', startTime: undefined }),
      makeTodo({ id: 'overdue-1', date: '2026-03-28', startTime: '09:00' }),
      makeTodo({ id: 'today-2', date: '2026-03-30', startTime: undefined }),
      makeTodo({ id: 'today-1', date: '2026-03-30', startTime: '08:30' }),
      makeTodo({ id: 'done', date: '2026-03-29', completed: true, completedAt: 999 })
    ]
    store.setSelectedDate('2026-03-30')

    expect(store.overdueTodos.map((item) => item.id)).toEqual(['overdue-1', 'overdue-2'])
    expect(store.selectedDateTodos.map((item) => item.id)).toEqual(['today-1', 'today-2'])
    expect(store.completedTodos.map((item) => item.id)).toEqual(['done'])
  })

  it('新增、完成和删除事项时会同步更新持久化内容', () => {
    const store = useTodoStore()
    store.init()

    store.addTodo({
      title: '写计划',
      date: '2026-03-30',
      startTime: '14:30',
      endTime: '15:30',
      description: '梳理本周交付内容'
    })
    const created = store.items[0]

    expect(created.title).toBe('写计划')
    expect(created.startTime).toBe('14:30')
    expect(created.endTime).toBe('15:30')
    expect(created.description).toBe('梳理本周交付内容')
    expect(localStorageMock.setItem).toHaveBeenCalled()

    store.toggleTodo(created.id)
    expect(store.completedTodos[0].id).toBe(created.id)
    expect(store.completedTodos[0].completedAt).toBeTypeOf('number')

    store.deleteTodo(created.id)
    expect(store.items).toHaveLength(0)
  })

  it('切换日期后，快速新增默认跟随当前选中日期', () => {
    const store = useTodoStore()
    store.init()
    store.setSelectedDate('2026-04-01')

    store.addTodo({ title: '四月事项', date: store.selectedDate })

    expect(store.selectedDateTodos[0].date).toBe('2026-04-01')
  })

  it('取消完成后，事项会回到对应的未完成分组', () => {
    const store = useTodoStore()
    store.init()
    store.addTodo({ title: '反复横跳', date: '2026-03-30' })
    const id = store.items[0].id

    store.toggleTodo(id)
    store.toggleTodo(id)

    expect(store.completedTodos).toHaveLength(0)
    expect(store.selectedDateTodos[0].id).toBe(id)
  })

  it('可以一键清除今天之前的历史记录，并保留今天及之后的事项', () => {
    const store = useTodoStore()
    store.items = [
      makeTodo({ id: 'old-open', date: '2026-03-28' }),
      makeTodo({ id: 'old-done', date: '2026-03-29', completed: true }),
      makeTodo({ id: 'today', date: '2026-03-30' }),
      makeTodo({ id: 'future', date: '2026-04-01' })
    ]

    const cleared = store.clearBeforeToday()

    expect(cleared).toBe(2)
    expect(store.items.map((item) => item.id)).toEqual(['today', 'future'])
    expect(localStorageMock.setItem).toHaveBeenCalled()
  })
})
