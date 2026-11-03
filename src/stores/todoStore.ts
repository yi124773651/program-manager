import { defineStore } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import type { TodoInput, TodoItem, TodoReplanDraft, TodoReplanRecord } from '@/types/todo'
import { getTodayDateKey } from '@/types/todo'
import { persistenceService } from '@/services/persistenceService'
import { consumeFollowingBuffer, createReplanDraft, getActualMinutes, getTodoRange, minutesToTime, validateReplanChanges, validateTodoSchedule } from '@/services/todoScheduleService'

type StoredTodoItem = Partial<TodoItem> & { time?: string }
interface TodosStorage { items?: StoredTodoItem[]; timeBlocksVersion?: number; replans?: TodoReplanRecord[] }

export const normalizeTodoItem = (item: StoredTodoItem, fallbackId = 'legacy'): TodoItem => ({
  id: item.id || fallbackId,
  title: item.title?.trim() ?? '',
  date: item.date ?? getTodayDateKey(),
  startTime: item.startTime || item.time || undefined,
  endTime: item.endTime || undefined,
  description: item.description?.trim() ?? '',
  completed: item.completed ?? false,
  createdAt: item.createdAt ?? Date.now(),
  updatedAt: item.updatedAt ?? Date.now(),
  completedAt: item.completedAt,
  kind: ['task', 'buffer', 'break'].includes(item.kind ?? '') ? item.kind : 'task',
  subtasks: Array.isArray(item.subtasks) ? item.subtasks : [],
  actualMinutes: Number.isFinite(item.actualMinutes) && item.actualMinutes! >= 0 ? item.actualMinutes : 0,
  timerStartedAt: Number.isFinite(item.timerStartedAt) && item.timerStartedAt! > 0 ? item.timerStartedAt : undefined,
  estimatedMinutes: Number.isFinite(item.estimatedMinutes) && item.estimatedMinutes! > 0 ? item.estimatedMinutes : undefined,
  splitFrom: item.splitFrom,
  remainingMinutes: Number.isFinite(item.remainingMinutes) && item.remainingMinutes! > 0 ? item.remainingMinutes : undefined
})

const compareBySchedule = (a: TodoItem, b: TodoItem) =>
  a.date.localeCompare(b.date) || (a.startTime || '99:99').localeCompare(b.startTime || '99:99') || a.updatedAt - b.updatedAt

// 每个窗口内串行生成快照并写盘，后一次修改必须基于前一次成功的结果。
const writeQueues = new WeakMap<object, Promise<unknown>>()

export const useTodoStore = defineStore('todoSchedule', {
  state: () => ({
    items: [] as TodoItem[],
    selectedDate: getTodayDateKey(),
    initialized: false,
    timeBlocksVersion: 0,
    saving: false,
    lastError: '',
    loadFailed: false,
    replans: [] as TodoReplanRecord[],
    replanDraft: null as TodoReplanDraft | null
  }),
  getters: {
    scheduleItems: (state): TodoItem[] => state.replanDraft?.items ?? state.items,
    runningTodo: (state) => state.items.find((item) => !!item.timerStartedAt),
    overdueTodos: (state) => state.items.filter((item) => !item.completed && !item.splitFrom && item.date < state.selectedDate).sort(compareBySchedule),
    selectedDateTodos: (state) => state.items.filter((item) => !item.completed && !item.splitFrom && item.date === state.selectedDate).sort(compareBySchedule),
    completedTodos: (state) => state.items.filter((item) => item.completed).sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
  },
  actions: {
    async init() {
      if (this.initialized) return
      this.initialized = await this.loadFromStorage()
    },
    async loadFromStorage() {
      const previous = writeQueues.get(this) ?? Promise.resolve()
      const operation = previous.then(async () => {
        this.saving = true
        try {
          const parsed = await persistenceService.load<TodosStorage>('todos', {}, { strict: true })
          if (!parsed || (parsed.items !== undefined && !Array.isArray(parsed.items))) throw new Error('待办文件格式无效，请从备份恢复。')
          const items: TodoItem[] = []
          const seenIds = new Set<string>()
          for (const item of parsed.items ?? []) {
            if (!item || typeof item !== 'object') throw new Error('待办条目格式无效。')
            const id = item.id || await invoke<string>('create_todo_id')
            if (seenIds.has(id)) throw new Error('待办存在重复标识，请检查数据后重新加载。')
            seenIds.add(id)
            items.push(normalizeTodoItem(item, id))
          }
          this.items = items
          this.timeBlocksVersion = parsed.timeBlocksVersion ?? 0
          this.replans = Array.isArray(parsed.replans) ? parsed.replans : []
          this.lastError = ''
          this.loadFailed = false
          return true
        } catch (error) {
          this.lastError = `加载待办失败：${String(error)}`
          this.loadFailed = true
          return false
        } finally { this.saving = false }
      })
      writeQueues.set(this, operation)
      return operation
    },
    async changeItems(change: (items: TodoItem[]) => void | Promise<void>, mode: 'edit' | 'begin-replan' | 'commit-replan' = 'edit'): Promise<boolean> {
      const previous = writeQueues.get(this) ?? Promise.resolve()
      const operation = previous.then(async () => {
        this.saving = true
        this.lastError = ''
        try {
          if (this.loadFailed) throw new Error('待办读取失败，已阻止覆盖写入；请重新打开窗口或重新加载后重试。')
          if (mode === 'begin-replan') {
            if (this.replanDraft) throw new Error('请先确认或取消当前重排。')
            this.replanDraft = await createReplanDraft(this.items, this.selectedDate, new Date(), () => invoke<string>('create_todo_id'))
            return true
          }
          const draft = this.replanDraft
          if (mode === 'commit-replan' && !draft) throw new Error('没有待确认的重排。')
          const next: TodoItem[] = JSON.parse(JSON.stringify(draft?.items ?? this.items))
          await change(next)
          if (draft) {
            validateReplanChanges(next, draft)
            if (mode === 'edit') {
              draft.items = next
              return true
            }
            if (draft.original !== JSON.stringify(this.items)) throw new Error('原计划已发生变化，请取消后重新发起重排。')
          }
          const replans = draft ? [...this.replans, { date: draft.date, at: Date.now(), anchor: draft.anchor, reason: draft.reason }] : this.replans
          // 标记与扩展字段一同写入，重启后不重复备份；备份失败时保持旧文件。
          if (this.timeBlocksVersion < 1) await persistenceService.backup('todos', '首次保存时间块字段前备份')
          await persistenceService.save('todos', { items: next, timeBlocksVersion: 1, replans })
          this.items = next
          this.timeBlocksVersion = 1
          this.replans = replans
          if (mode === 'commit-replan') this.replanDraft = null
          return true
        } catch (error) {
          this.lastError = error instanceof Error ? error.message : `保存失败：${String(error)}`
          return false
        } finally {
          this.saving = false
        }
      })
      writeQueues.set(this, operation)
      return operation
    },
    setSelectedDate(date: string) {
      if (this.replanDraft && date !== this.replanDraft.date) { this.lastError = '请先确认或取消当天重排，再切换日期。'; return }
      this.selectedDate = date
    },
    async beginReplan(): Promise<boolean> { return this.changeItems(() => {}, 'begin-replan') },
    async confirmReplan(): Promise<boolean> { return this.changeItems(() => {}, 'commit-replan') },
    cancelReplan() { if (!this.saving) { this.replanDraft = null; this.lastError = '' } },
    async addTodo(input: TodoInput): Promise<string | null> {
      let id = ''
      const saved = await this.changeItems(async (items) => {
        id = await invoke<string>('create_todo_id')
        const now = Date.now()
        const item = normalizeTodoItem({ ...input, id, createdAt: now, updatedAt: now })
        validateTodoSchedule(item, items)
        const range = getTodoRange(item)
        if (range && range.end - range.start < 30) throw new Error('新时间块至少需要 30 分钟。')
        item.estimatedMinutes = range ? range.end - range.start : undefined
        items.unshift(item)
      })
      return saved ? id : null
    },
    async updateTodo(id: string, patch: Partial<TodoInput>): Promise<boolean> {
      return this.changeItems((items) => {
        const target = items.find((item) => item.id === id)
        if (!target) throw new Error('该事项已不存在。')
        if (target.splitFrom) throw new Error('已过去的重排片段不能编辑。')
        const next = { ...target, ...patch, updatedAt: Date.now() }
        next.title = next.title.trim()
        next.description = next.description?.trim() ?? ''
        next.startTime ||= undefined
        next.endTime ||= undefined
        const scheduleChanged = next.date !== target.date || next.startTime !== target.startTime || next.endTime !== target.endTime
        if (!next.title) throw new Error('请填写事项标题。')
        const range = getTodoRange(next)
        const originalRange = getTodoRange(target)
        const duration = range ? range.end - range.start : 0
        const originalDuration = originalRange ? originalRange.end - originalRange.start : 0
        // 旧分钟精度和重排截出的尾段可以原长移动；新建的常规块至少半小时。
        if (scheduleChanged && range && duration < 30 && duration !== target.remainingMinutes && duration !== originalDuration) {
          throw new Error('新安排的时间块至少需要 30 分钟。')
        }
        if (range && !next.estimatedMinutes) next.estimatedMinutes = duration
        if (scheduleChanged) next.remainingMinutes = range ? undefined : (originalDuration || target.remainingMinutes)
        if (scheduleChanged && next.date === target.date && next.startTime === target.startTime && (next.kind ?? 'task') === 'task' && originalRange && range && range.end > originalRange.end) {
          const extended = consumeFollowingBuffer(items, id, next.endTime!)
          Object.assign(extended.find((item) => item.id === id)!, next)
          items.splice(0, items.length, ...extended)
          return
        }
        // 旧的重叠数据仍允许改标题；只有排期变化才要求解除冲突。
        if (scheduleChanged) validateTodoSchedule(next, items)
        Object.assign(target, next)
      })
    },
    async toggleTodo(id: string): Promise<boolean> {
      return this.changeItems((items) => {
        const target = items.find((item) => item.id === id)
        if (!target || target.splitFrom) return
        target.completed = !target.completed
        if (target.completed && target.timerStartedAt) {
          target.actualMinutes = getActualMinutes(target)
          target.timerStartedAt = undefined
        }
        target.completedAt = target.completed ? Date.now() : undefined
        target.updatedAt = Date.now()
      })
    },
    async replaceBuffer(bufferId: string, todoId: string): Promise<boolean> {
      return this.changeItems((items) => {
        const buffer = items.find((item) => item.id === bufferId && item.kind === 'buffer' && !item.completed && !item.splitFrom)
        const target = items.find((item) => item.id === todoId && !getTodoRange(item) && !item.completed && !item.splitFrom)
        if (!buffer || !target || !getTodoRange(buffer)) throw new Error('备用块或未排期事项已变化，请重新选择。')
        if (buffer.timerStartedAt) throw new Error('请先停止备用块计时。')
        Object.assign(target, { date: buffer.date, startTime: buffer.startTime, endTime: buffer.endTime, kind: 'task', updatedAt: Date.now() })
        target.estimatedMinutes ??= getTodoRange(buffer)!.end - getTodoRange(buffer)!.start
        target.remainingMinutes = undefined
        items.splice(items.indexOf(buffer), 1)
        validateTodoSchedule(target, items)
      })
    },
    async addSubtask(id: string, title: string): Promise<boolean> {
      return this.changeItems(async (items) => {
        const target = items.find((item) => item.id === id && !item.splitFrom)
        if (!target || !title.trim()) throw new Error('请填写子任务标题。')
        target.subtasks ??= []
        target.subtasks.push({ id: await invoke<string>('create_todo_id'), title: title.trim(), completed: false })
        target.updatedAt = Date.now()
      })
    },
    async changeSubtask(id: string, subtaskId: string, remove = false): Promise<boolean> {
      return this.changeItems((items) => {
        const target = items.find((item) => item.id === id && !item.splitFrom)
        const subtask = target?.subtasks?.find((item) => item.id === subtaskId)
        if (!target || !subtask) throw new Error('子任务已不存在。')
        if (remove) target.subtasks = target.subtasks!.filter((item) => item.id !== subtaskId)
        else subtask.completed = !subtask.completed
        target.updatedAt = Date.now()
      })
    },
    async deleteTodo(id: string): Promise<boolean> {
      return this.changeItems((items) => {
        const index = items.findIndex((item) => item.id === id)
        if (items[index]?.splitFrom) throw new Error('已过去的重排片段不能单独删除。')
        if (index >= 0) items.splice(index, 1)
      })
    },
    async setTimer(id: string, running: boolean): Promise<boolean> {
      return this.changeItems((items) => {
        if (this.replanDraft) throw new Error('请先确认或取消重排，再操作计时。')
        const target = items.find((item) => item.id === id && !item.splitFrom)
        if (!target) throw new Error('该事项已不存在。')
        if (running && target.completed) throw new Error('已完成事项不能开始计时。')
        const now = Date.now()
        if (running) {
          // 切换任务先结算其他计时器，两项变更在同一份快照中落盘。
          for (const item of items) {
            if (item.id !== id && item.timerStartedAt) {
              item.actualMinutes = getActualMinutes(item, now)
              item.timerStartedAt = undefined
              item.updatedAt = now
            }
          }
          target.timerStartedAt ??= now
          const range = getTodoRange(target)
          if (range) target.estimatedMinutes ??= range.end - range.start
        } else if (target.timerStartedAt) {
          target.actualMinutes = getActualMinutes(target, now)
          target.timerStartedAt = undefined
        }
        target.updatedAt = now
      })
    },
    async fillScheduleGaps(date: string, gaps: { start: number; end: number }[]): Promise<boolean> {
      return this.changeItems(async (items) => {
        for (const gap of gaps) {
          const item = normalizeTodoItem({ id: await invoke<string>('create_todo_id'), title: '备用时间', date, kind: 'buffer', startTime: minutesToTime(gap.start), endTime: minutesToTime(gap.end) })
          validateTodoSchedule(item, items)
          items.push(item)
        }
      })
    },
    async clearBeforeToday(): Promise<number> {
      let count = 0
      const saved = await this.changeItems((items) => {
        if (this.replanDraft) throw new Error('请先确认或取消重排，再清理历史。')
        for (let index = items.length - 1; index >= 0; index--) {
          if (items[index].date < getTodayDateKey() && (items[index].completed || items[index].splitFrom) && !items[index].timerStartedAt) {
            items.splice(index, 1)
            count++
          }
        }
      })
      return saved ? count : 0
    }
  }
})
