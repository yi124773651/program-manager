import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useNotesStore, type QuickNote } from './notesStore'
import { persistenceService } from '@/services/persistenceService'

vi.mock('@/services/persistenceService', () => ({
  persistenceService: {
    load: vi.fn(),
    save: vi.fn()
  }
}))

const mockedPersistenceService = vi.mocked(persistenceService)

const makeNote = (overrides: Partial<QuickNote> = {}): QuickNote => ({
  id: overrides.id ?? 'note-1',
  content: overrides.content ?? '原内容',
  createdAt: overrides.createdAt ?? 100,
  updatedAt: overrides.updatedAt ?? 100,
  color: overrides.color ?? '#fff9c4'
})

describe('useNotesStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockedPersistenceService.load.mockResolvedValue({ notes: [] })
    mockedPersistenceService.save.mockResolvedValue(undefined)
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-30T09:00:00'))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('初始化时会从统一持久化服务恢复便签', async () => {
    mockedPersistenceService.load.mockResolvedValue({
      notes: [makeNote({ id: 'saved', content: '已保存便签' })]
    })

    const store = useNotesStore()
    await store.init()

    expect(mockedPersistenceService.load).toHaveBeenCalledWith('notes', { notes: [] })
    expect(store.notes).toHaveLength(1)
    expect(store.notes[0].content).toBe('已保存便签')
  })

  it('编辑便签时使用防抖保存，避免每次输入都立即写文件', async () => {
    const store = useNotesStore()
    store.notes = [makeNote()]

    store.updateNote('note-1', '第一次输入')
    store.updateNote('note-1', '第二次输入')

    expect(mockedPersistenceService.save).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(799)
    expect(mockedPersistenceService.save).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(mockedPersistenceService.save).toHaveBeenCalledTimes(1)
    expect(mockedPersistenceService.save).toHaveBeenCalledWith('notes', {
      notes: [expect.objectContaining({ id: 'note-1', content: '第二次输入' })]
    })
  })

  it('关闭前会强制保存待写入的便签修改', async () => {
    const store = useNotesStore()
    store.notes = [makeNote()]

    store.updateNote('note-1', '关闭前内容')
    await store.flushPendingSave()

    expect(mockedPersistenceService.save).toHaveBeenCalledTimes(1)
    expect(mockedPersistenceService.save).toHaveBeenCalledWith('notes', {
      notes: [expect.objectContaining({ id: 'note-1', content: '关闭前内容' })]
    })

    await vi.advanceTimersByTimeAsync(800)
    expect(mockedPersistenceService.save).toHaveBeenCalledTimes(1)
  })
})
