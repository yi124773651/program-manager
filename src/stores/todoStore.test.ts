import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTodoStore } from './todoStore'
import type { TodoItem } from '@/types/todo'
import { persistenceService } from '@/services/persistenceService'

vi.mock('@/services/persistenceService', () => ({
  persistenceService: {
    load: vi.fn(),
    save: vi.fn(),
    backup: vi.fn()
  }
}))

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => crypto.randomUUID()) }))

const mockedPersistenceService = vi.mocked(persistenceService)
const lastSavedData = () => JSON.parse(JSON.stringify(mockedPersistenceService.save.mock.calls.slice(-1)[0][1]))

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
  completedAt: overrides.completedAt,
  ...overrides
})

describe('useTodoStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockedPersistenceService.load.mockResolvedValue({})
    mockedPersistenceService.save.mockResolvedValue(undefined)
    mockedPersistenceService.backup.mockResolvedValue(null)
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-30T09:00:00'))
  })
  afterEach(() => vi.useRealTimers())

  it('初始化时默认选择今天，并从持久化服务恢复事项', async () => {
    mockedPersistenceService.load.mockResolvedValue({
      items: [{ ...makeTodo({ id: 'saved', title: '已保存事项' }), time: '08:00' }]
    })

    const store = useTodoStore()
    await store.init()

    expect(store.selectedDate).toBe('2026-03-30')
    expect(mockedPersistenceService.load).toHaveBeenCalledWith('todos', {}, { strict: true })
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

  it('新增、完成和删除事项时会同步更新持久化内容', async () => {
    const store = useTodoStore()
    await store.init()

    await store.addTodo({
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
    expect(mockedPersistenceService.save).toHaveBeenCalledWith('todos', { items: store.items, timeBlocksVersion: 1, replans: [] })

    await store.toggleTodo(created.id)
    expect(store.completedTodos[0].id).toBe(created.id)
    expect(store.completedTodos[0].completedAt).toBeTypeOf('number')

    await store.deleteTodo(created.id)
    expect(store.items).toHaveLength(0)
  })

  it('切换日期后，快速新增默认跟随当前选中日期', async () => {
    const store = useTodoStore()
    await store.init()
    store.setSelectedDate('2026-04-01')

    await store.addTodo({ title: '四月事项', date: store.selectedDate })

    expect(store.selectedDateTodos[0].date).toBe('2026-04-01')
  })

  it('取消完成后，事项会回到对应的未完成分组', async () => {
    const store = useTodoStore()
    await store.init()
    await store.addTodo({ title: '反复横跳', date: '2026-03-30' })
    const id = store.items[0].id

    await store.toggleTodo(id)
    await store.toggleTodo(id)

    expect(store.completedTodos).toHaveLength(0)
    expect(store.selectedDateTodos[0].id).toBe(id)
  })

  it('首次写扩展字段前备份，后续保存和重新加载不重复备份', async () => {
    const store = useTodoStore()
    store.items = [makeTodo({ id: 'old', startTime: '09:15', endTime: '10:15' })]
    await store.updateTodo('old', { title: '仅修改标题' })
    await store.toggleTodo('old')
    expect(store.items[0].startTime).toBe('09:15')
    expect(mockedPersistenceService.backup).toHaveBeenCalledTimes(1)
    expect(mockedPersistenceService.backup.mock.invocationCallOrder[0]).toBeLessThan(mockedPersistenceService.save.mock.invocationCallOrder[0])
    mockedPersistenceService.load.mockResolvedValue({ items: store.items, timeBlocksVersion: 1 })
    await store.loadFromStorage()
    await store.toggleTodo('old')
    expect(mockedPersistenceService.backup).toHaveBeenCalledTimes(1)
  })

  it('备份或写盘失败时保留原计划，后续可重试', async () => {
    const store = useTodoStore()
    store.items = [makeTodo({ id: 'old', title: '原计划' })]
    mockedPersistenceService.backup.mockRejectedValueOnce(new Error('备份磁盘已满'))
    expect(await store.updateTodo('old', { title: '新计划' })).toBe(false)
    expect(mockedPersistenceService.save).not.toHaveBeenCalled()
    expect(store.items[0].title).toBe('原计划')
    mockedPersistenceService.save.mockRejectedValueOnce(new Error('写盘失败'))
    expect(await store.updateTodo('old', { title: '新计划' })).toBe(false)
    expect(store.items[0].title).toBe('原计划')
    expect(await store.updateTodo('old', { title: '新计划' })).toBe(true)
  })

  it('连续新增串行保存，拒绝冲突且不丢失先前事项', async () => {
    const store = useTodoStore()
    const input = { title: '会议', date: '2026-03-30', startTime: '09:00', endTime: '10:00' }
    const results = await Promise.all([store.addTodo(input), store.addTodo({ ...input, title: '冲突事项' })])
    expect(results[0]).toBeTypeOf('string')
    expect(results[1]).toBeNull()
    expect(store.items).toHaveLength(1)
    expect(store.lastError).toContain('会议')
  })

  it('读取失败保持内存并阻止覆盖，成功重载后恢复写入', async () => {
    const store = useTodoStore()
    store.items = [makeTodo({ id: '原计划' })]
    mockedPersistenceService.load.mockRejectedValueOnce(new Error('文件损坏'))
    expect(await store.loadFromStorage()).toBe(false)
    expect(await store.addTodo({ title: '不可覆盖', date: '2026-03-30' })).toBeNull()
    expect(store.items[0].id).toBe('原计划')
    expect(mockedPersistenceService.save).not.toHaveBeenCalled()
    mockedPersistenceService.load.mockResolvedValue({ items: store.items })
    expect(await store.loadFromStorage()).toBe(true)
    expect(await store.addTodo({ title: '恢复', date: '2026-03-30' })).toBeTypeOf('string')
  })

  it('排期、备用消耗和子任务修改落在同一次保存中且重新加载保持一致', async () => {
    const store = useTodoStore()
    store.items = [makeTodo({ id: '任务', startTime: '09:00', endTime: '10:00', estimatedMinutes: 60 }), makeTodo({ id: '备用', kind: 'buffer', startTime: '10:00', endTime: '11:00' })]
    expect(await store.updateTodo('任务', { endTime: '10:30' })).toBe(true)
    expect(store.items[1].startTime).toBe('10:30')
    expect(store.items[0].estimatedMinutes).toBe(60)
    expect(mockedPersistenceService.save).toHaveBeenCalledTimes(1)
    await store.addSubtask('任务', '准备材料')
    const subtaskId = store.items[0].subtasks![0].id
    await store.changeSubtask('任务', subtaskId)
    expect(store.items[0].completed).toBe(false)
    mockedPersistenceService.load.mockResolvedValue(lastSavedData())
    await store.loadFromStorage()
    expect(store.items[0].subtasks).toEqual([{ id: subtaskId, title: '准备材料', completed: true }])
    expect(store.items[0].endTime).toBe('10:30')
    await store.changeSubtask('任务', subtaskId, true)
    expect(store.items[0].subtasks).toEqual([])
  })

  it('备用替换保留目标事项标识及子任务，删除备用与排期原子保存', async () => {
    const store = useTodoStore()
    store.items = [makeTodo({ id: '备用', kind: 'buffer', startTime: '10:00', endTime: '11:00' }), makeTodo({ id: '待办', subtasks: [{ id: '子项', title: '执行', completed: false }] })]
    await store.replaceBuffer('备用', '待办')
    expect(store.items).toHaveLength(1)
    expect(store.items[0]).toMatchObject({ id: '待办', startTime: '10:00', endTime: '11:00', kind: 'task', estimatedMinutes: 60, subtasks: [{ id: '子项' }] })
    expect(mockedPersistenceService.save).toHaveBeenCalledTimes(1)
  })

  it('一键填补空白为一次保存，任何一个区段冲突时全部回滚', async () => {
    const store = useTodoStore()
    store.items = [makeTodo({ id: '会议', startTime: '10:00', endTime: '11:00' })]
    expect(await store.fillScheduleGaps('2026-03-30', [{ start: 540, end: 600 }, { start: 600, end: 630 }])).toBe(false)
    expect(store.items).toHaveLength(1)
    expect(mockedPersistenceService.save).not.toHaveBeenCalled()
    expect(await store.fillScheduleGaps('2026-03-30', [{ start: 540, end: 600 }, { start: 660, end: 720 }])).toBe(true)
    expect(store.items).toHaveLength(3)
    expect(mockedPersistenceService.save).toHaveBeenCalledTimes(1)
  })

  it('旧重叠块允许改说明，新排期拒绝冲突，旧分钟精度不取整', async () => {
    const store = useTodoStore()
    store.items = [makeTodo({ id: '甲', startTime: '09:15', endTime: '10:15' }), makeTodo({ id: '乙', startTime: '09:30', endTime: '10:00' })]
    expect(await store.updateTodo('甲', { description: '保留重叠' })).toBe(true)
    expect(store.items[0].startTime).toBe('09:15')
    expect(await store.updateTodo('乙', { startTime: '09:45', endTime: '10:30' })).toBe(false)
    expect(store.items[1].startTime).toBe('09:30')
    expect(await store.addTodo({ title: '太短', date: '2026-03-30', startTime: '12:00', endTime: '12:15' })).toBeNull()
    expect(await store.addTodo({ title: '短备用', kind: 'buffer', date: '2026-03-30', startTime: '12:00', endTime: '12:15' })).toBeNull()
  })

  it('重排编辑完全留在草稿，取消恢复原计划且不记录次数', async () => {
    vi.setSystemTime(new Date('2026-03-30T10:01:00'))
    const store = useTodoStore()
    store.items = [makeTodo({ id: '任务', startTime: '10:00', endTime: '11:30', subtasks: [{ id: '子项', title: '材料', completed: false }] })]
    const before = JSON.stringify(store.items)
    expect(await store.beginReplan()).toBe(true)
    expect(store.replanDraft?.anchor).toBe(630)
    expect(await store.updateTodo('任务', { startTime: '13:00', endTime: '14:00' })).toBe(true)
    expect(store.scheduleItems.find(item => item.id === '任务')?.startTime).toBe('13:00')
    expect(JSON.stringify(store.items)).toBe(before)
    expect(mockedPersistenceService.save).not.toHaveBeenCalled()
    store.cancelReplan()
    expect(store.replanDraft).toBeNull()
    expect(JSON.stringify(store.items)).toBe(before)
    expect(store.replans).toEqual([])
  })

  it('重排失败保留草稿，确认后原标识、计时和原因一并持久化，锚点不漂移', async () => {
    vi.setSystemTime(new Date('2026-03-30T10:01:00'))
    const store = useTodoStore()
    store.items = [makeTodo({ id: '任务', startTime: '10:00', endTime: '11:30', actualMinutes: 20, timerStartedAt: Date.now() })]
    await store.beginReplan()
    store.replanDraft!.reason = 'urgent'
    vi.setSystemTime(new Date('2026-03-30T11:00:00'))
    expect(store.replanDraft!.anchor).toBe(630)
    await store.updateTodo('任务', { startTime: '13:00', endTime: '14:00' })
    mockedPersistenceService.save.mockRejectedValueOnce(new Error('保存失败'))
    expect(await store.confirmReplan()).toBe(false)
    expect(store.replanDraft).not.toBeNull()
    expect(store.replans).toHaveLength(0)
    expect(await store.confirmReplan()).toBe(true)
    expect(store.replanDraft).toBeNull()
    expect(store.items.find(item => item.id === '任务')).toMatchObject({ startTime: '13:00', actualMinutes: 20, timerStartedAt: new Date('2026-03-30T10:01:00').getTime() })
    expect(store.replans).toEqual([{ date: '2026-03-30', anchor: 630, at: Date.now(), reason: 'urgent' }])
    mockedPersistenceService.load.mockResolvedValue(lastSavedData())
    await store.loadFromStorage()
    expect(store.replans[0].reason).toBe('urgent')
    expect(store.items.filter(item => item.splitFrom)).toHaveLength(1)
  })

  it('重排中保护过去、已完成及其他日期，剩余尾段不足半小时也能原长重新摆放', async () => {
    vi.setSystemTime(new Date('2026-03-30T10:00:00'))
    const store = useTodoStore()
    store.items = [makeTodo({ id: '过去', startTime: '08:00', endTime: '09:00' }), makeTodo({ id: '完成', startTime: '10:00', endTime: '11:00', completed: true }), makeTodo({ id: '尾段', startTime: '09:00', endTime: '10:15' }), makeTodo({ id: '明天', date: '2026-03-31' })]
    await store.beginReplan()
    expect(await store.updateTodo('过去', { title: '改变' })).toBe(false)
    expect(await store.toggleTodo('完成')).toBe(false)
    expect(await store.deleteTodo('明天')).toBe(false)
    expect(await store.updateTodo('尾段', { startTime: '09:00', endTime: '09:15' })).toBe(false)
    expect(await store.updateTodo('尾段', { startTime: '13:00', endTime: '13:15' })).toBe(true)
    expect(await store.confirmReplan()).toBe(true)
    expect(store.items.find(item => item.id === '过去')?.startTime).toBe('08:00')
    expect(store.items.find(item => item.id === '完成')?.completed).toBe(true)
  })

  it('确认重排前检测基础计划变化，防止用旧草稿覆盖重新加载的数据', async () => {
    const store = useTodoStore()
    store.items = [makeTodo({ id: '任务', startTime: '13:00', endTime: '14:00' })]
    await store.beginReplan()
    mockedPersistenceService.load.mockResolvedValue({ items: [makeTodo({ id: '任务', title: '外部更新' })] })
    await store.loadFromStorage()
    expect(await store.confirmReplan()).toBe(false)
    expect(store.lastError).toContain('原计划已发生变化')
    expect(store.items[0].title).toBe('外部更新')
  })

  it('计时开始保存时间戳，重新加载后累计多段，重复停止不重复累计', async () => {
    const store = useTodoStore()
    store.items = [makeTodo({ id: '任务', startTime: '09:00', endTime: '10:00' })]
    await store.setTimer('任务', true)
    const started = Date.now()
    const snapshot = lastSavedData()
    vi.setSystemTime(new Date(started + 20 * 60000))
    mockedPersistenceService.load.mockResolvedValue(snapshot)
    await store.loadFromStorage()
    expect(store.runningTodo?.timerStartedAt).toBe(started)
    await store.setTimer('任务', false)
    await store.setTimer('任务', false)
    expect(store.items[0].actualMinutes).toBe(20)
    await store.setTimer('任务', true)
    vi.setSystemTime(new Date(started + 35 * 60000))
    await store.toggleTodo('任务')
    expect(store.items[0].actualMinutes).toBe(35)
    expect(store.items[0].timerStartedAt).toBeUndefined()
  })

  it('切换计时原子结算前一项，保存失败时运行状态不变', async () => {
    const store = useTodoStore()
    store.items = [makeTodo({ id: '甲' }), makeTodo({ id: '乙' })]
    const started = Date.now()
    await store.setTimer('甲', true)
    vi.setSystemTime(new Date(started + 5 * 60000))
    mockedPersistenceService.save.mockRejectedValueOnce(new Error('磁盘满'))
    expect(await store.setTimer('乙', true)).toBe(false)
    expect(store.runningTodo?.id).toBe('甲')
    expect(await store.setTimer('乙', true)).toBe(true)
    expect(store.items[0].actualMinutes).toBe(5)
    expect(store.items[0].timerStartedAt).toBeUndefined()
    expect(store.runningTodo?.id).toBe('乙')
  })

  it('最后半小时和完整全天可以持久化，重新加载不丢失 24:00', async () => {
    const store = useTodoStore()
    const id = await store.addTodo({ title: '夜间阅读', date: '2026-03-30', startTime: '23:30', endTime: '24:00' })
    expect(id).toBeTypeOf('string')
    expect(store.items[0].estimatedMinutes).toBe(30)
    mockedPersistenceService.load.mockResolvedValue(lastSavedData())
    await store.loadFromStorage()
    expect(store.items[0].endTime).toBe('24:00')
    expect(await store.updateTodo(id!, { title: '保留午夜边界' })).toBe(true)
    expect(store.items[0].endTime).toBe('24:00')
    expect(await store.addTodo({ title: '周末全天', date: '2026-04-04', startTime: '00:00', endTime: '24:00' })).toBeTypeOf('string')
    expect(store.items[0].estimatedMinutes).toBe(1440)
    expect(await store.addTodo({ title: '无效开始', date: '2026-03-30', startTime: '24:00' })).toBeNull()
  })
})
