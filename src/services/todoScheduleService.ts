import { DEFAULT_TODO_SCHEDULE, getTodayDateKey, type TodoItem, type TodoReplanDraft, type TodoReplanRecord, type TodoScheduleSettings } from '@/types/todo'

export interface TimeRange { start: number; end: number }

export const FULL_DAY_RANGE: Readonly<TimeRange> = { start: 0, end: 1440 }

export function timeToMinutes(value?: string): number | null {
  // 24:00 表示所选日期的结束边界，不代表次日的开始时间。
  if (value === '24:00') return FULL_DAY_RANGE.end
  if (!value || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}

export function minutesToTime(value: number): string {
  const minute = Math.max(0, Math.min(FULL_DAY_RANGE.end, Math.round(value)))
  return `${Math.floor(minute / 60)}`.padStart(2, '0') + ':' + `${minute % 60}`.padStart(2, '0')
}

export function snapMinutes(value: number, step = 30, direction: 'round' | 'ceil' | 'floor' = 'round'): number {
  return Math[direction](value / step) * step
}

export function getTodoRange(item: Pick<TodoItem, 'startTime' | 'endTime'>): TimeRange | null {
  const start = timeToMinutes(item.startTime)
  const end = timeToMinutes(item.endTime)
  return start !== null && end !== null && start < FULL_DAY_RANGE.end && end > start ? { start, end } : null
}

export function rangesOverlap(a: TimeRange, b: TimeRange): boolean {
  // 相接的两个区间不冲突，结束时刻属于下一个时间块。
  return a.start < b.end && b.start < a.end
}

export function getCoverage(items: Pick<TodoItem, 'startTime' | 'endTime'>[], work: TimeRange) {
  const ranges = items.map(getTodoRange).filter((range): range is TimeRange => !!range)
    .map((range) => ({ start: Math.max(work.start, range.start), end: Math.min(work.end, range.end) }))
    .filter((range) => range.end > range.start).sort((a, b) => a.start - b.start)
  const gaps: TimeRange[] = []
  let cursor = work.start
  for (const range of ranges) {
    if (range.start > cursor) gaps.push({ start: cursor, end: range.start })
    cursor = Math.max(cursor, range.end)
  }
  if (cursor < work.end) gaps.push({ start: cursor, end: work.end })
  const total = Math.max(0, work.end - work.start)
  return { total, planned: total - gaps.reduce((sum, gap) => sum + gap.end - gap.start, 0), gaps }
}

export function getConflictIds(items: TodoItem[]): Set<string> {
  const conflicts = new Set<string>()
  const scheduled = items.map((item) => ({ item, range: getTodoRange(item) }))
    .filter((entry): entry is { item: TodoItem; range: TimeRange } => !!entry.range)
    .sort((a, b) => a.range.start - b.range.start)
  for (let i = 0; i < scheduled.length; i++) {
    for (let j = i + 1; j < scheduled.length && scheduled[j].range.start < scheduled[i].range.end; j++) {
      if (scheduled[i].item.date === scheduled[j].item.date) {
        conflicts.add(scheduled[i].item.id)
        conflicts.add(scheduled[j].item.id)
      }
    }
  }
  return conflicts
}

export function validateTodoSchedule(item: TodoItem, items: TodoItem[]): void {
  if (!item.title.trim()) throw new Error('请填写事项标题。')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(item.date) || getTodayDateKey(new Date(`${item.date}T00:00:00`)) !== item.date) {
    throw new Error('请选择有效日期。')
  }
  if (item.startTime && timeToMinutes(item.startTime) === null || item.endTime && timeToMinutes(item.endTime) === null) {
    throw new Error('时间格式无效，请使用小时和分钟。')
  }
  if (item.startTime === '24:00') throw new Error('开始时间必须早于 24:00；次日事项请切换日期后安排。')
  if (item.endTime && !item.startTime) throw new Error('请先设置开始时间。')
  const range = getTodoRange(item)
  if (item.startTime && item.endTime && !range) throw new Error('结束时间必须晚于开始时间，暂不支持跨午夜。')
  if (!range) return
  const conflict = items.find((other) => {
    const otherRange = getTodoRange(other)
    return other.id !== item.id && other.date === item.date && otherRange && rangesOverlap(range, otherRange)
  })
  if (conflict) throw new Error(`与「${conflict.title}」${conflict.startTime}–${conflict.endTime} 冲突，请选择其他时段。`)
}

export function validateScheduleSettings(settings: TodoScheduleSettings): string {
  if (!Array.isArray(settings.workDays) || settings.workDays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
    return '工作日必须是周一至周日。'
  }
  const work = getTodoRange({ startTime: settings.workStart, endTime: settings.workEnd })
  const lunch = getTodoRange({ startTime: settings.lunchStart, endTime: settings.lunchEnd })
  if (!work || work.end - work.start < 30) return '工作时段至少 30 分钟，结束时间必须晚于开始时间。'
  if (!lunch || lunch.end - lunch.start < 30) return '午饭时段至少 30 分钟，且不能跨午夜。'
  if (![30, 60].includes(settings.snapMinutes)) return '拖拽吸附步长请选择 30 或 60 分钟。'
  return ''
}

export function consumeFollowingBuffer(items: TodoItem[], id: string, newEnd: string): TodoItem[] {
  const target = items.find((item) => item.id === id)
  const range = target && getTodoRange(target)
  const end = timeToMinutes(newEnd)
  if (!target || !range || end === null || end <= range.end) throw new Error('请选择晚于原结束时间的时刻。')
  const buffer = items.find((item) => item.date === target.date && item.kind === 'buffer' && !item.completed && getTodoRange(item)?.start === range.end)
  if (buffer?.timerStartedAt) throw new Error('请先停止备用块计时，再占用它的时间。')
  const bufferRange = buffer && getTodoRange(buffer)
  if (bufferRange && end > bufferRange.end) throw new Error('延长时长超过相邻备用时间，请先调整后续安排。')
  const next = items.filter((item) => item.id !== buffer?.id || end !== bufferRange?.end).map((item) => {
    if (item.id === id) return { ...item, endTime: newEnd, updatedAt: Date.now() }
    if (item.id === buffer?.id) return { ...item, startTime: newEnd, updatedAt: Date.now() }
    return item
  })
  validateTodoSchedule(next.find((item) => item.id === id)!, next)
  return next
}

export function normalizeScheduleSettings(value?: Partial<TodoScheduleSettings>): TodoScheduleSettings {
  const settings = { ...DEFAULT_TODO_SCHEDULE, ...value }
  return validateScheduleSettings(settings) ? { ...DEFAULT_TODO_SCHEDULE, workDays: [...DEFAULT_TODO_SCHEDULE.workDays] } : { ...settings, workDays: [...settings.workDays] }
}

export function getActualMinutes(item: TodoItem, now = Date.now()): number {
  const settled = Number.isFinite(item.actualMinutes) ? Math.max(0, item.actualMinutes ?? 0) : 0
  const elapsed = item.timerStartedAt ? Math.max(0, now - item.timerStartedAt) / 60000 : 0
  return settled + elapsed
}

export function getEstimateSuggestion(items: TodoItem[], minutes: number) {
  const ratios = items.filter((item) => !item.splitFrom && (item.kind ?? 'task') === 'task' && !item.timerStartedAt)
    .map((item) => {
      const range = getTodoRange(item)
      const estimated = item.estimatedMinutes ?? (range ? range.end - range.start : 0)
      return estimated > 0 && (item.actualMinutes ?? 0) > 0 ? item.actualMinutes! / estimated : 0
    }).filter((ratio) => Number.isFinite(ratio) && ratio > 0).sort((a, b) => a - b)
  if (!ratios.length) return null
  const middle = Math.floor(ratios.length / 2)
  const ratio = ratios.length % 2 ? ratios[middle] : (ratios[middle - 1] + ratios[middle]) / 2
  return { samples: ratios.length, ratio, minutes: Math.max(30, snapMinutes(minutes * ratio, 30, 'ceil')) }
}

export async function createReplanDraft(items: TodoItem[], date: string, now: Date, createId: () => Promise<string>): Promise<TodoReplanDraft> {
  if (date !== getTodayDateKey(now)) throw new Error('请切换到今天，再从当前时刻重排。')
  // 包含秒数，避免 10:30:01 仍被舍入到已过去的 10:30。
  const minute = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60 + now.getMilliseconds() / 60000
  const anchor = snapMinutes(minute, 30, 'ceil')
  if (anchor >= 1440) throw new Error('今天已没有可重排的时间，请安排明天。')
  const draft: TodoReplanDraft = { date, anchor, items: [], original: JSON.stringify(items), fixedIds: [] }
  for (const original of items) {
    const item: TodoItem = JSON.parse(JSON.stringify(original))
    const range = getTodoRange(item)
    if (item.date !== date || item.completed || item.splitFrom || (range && range.end <= anchor)) {
      draft.fixedIds.push(item.id)
    } else if (range) {
      if (range.start < anchor) {
        const fragment: TodoItem = {
          id: await createId(), title: item.title, date, description: item.description,
          startTime: item.startTime, endTime: minutesToTime(anchor), kind: item.kind,
          completed: false, createdAt: now.getTime(), updatedAt: now.getTime(), splitFrom: item.id,
          subtasks: [], actualMinutes: 0
        }
        draft.items.push(fragment)
        draft.fixedIds.push(fragment.id)
      }
      item.remainingMinutes = range.end - Math.max(anchor, range.start)
      item.estimatedMinutes ??= range.end - range.start
      item.startTime = undefined
      item.endTime = undefined
      item.updatedAt = now.getTime()
    }
    draft.items.push(item)
  }
  return draft
}

export function validateReplanChanges(items: TodoItem[], draft: TodoReplanDraft): void {
  const originals = new Map(draft.items.map((item) => [item.id, item]))
  const nextItems = new Map(items.map((item) => [item.id, item]))
  const fixed = new Set(draft.fixedIds)
  for (const id of draft.fixedIds) {
    if (JSON.stringify(nextItems.get(id)) !== JSON.stringify(originals.get(id))) {
      throw new Error('锚点之前、已完成和其他日期的事项在重排中保持不变。')
    }
  }
  for (const item of items) {
    if (fixed.has(item.id)) continue
    if (item.date !== draft.date) throw new Error('重排期间只能安排当天事项，请确认或取消后再改日期。')
    const range = getTodoRange(item)
    if (range && range.start < draft.anchor) throw new Error('请把剩余事项安排到重排锚点之后。')
    const previous = originals.get(item.id)
    if (!previous || previous.startTime !== item.startTime || previous.endTime !== item.endTime) validateTodoSchedule(item, items)
  }
}

export function getWeekReview(items: TodoItem[], records: TodoReplanRecord[], date: string, now = Date.now()) {
  const monday = new Date(`${date}T00:00:00`)
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7)
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(monday)
    day.setDate(monday.getDate() + index)
    const key = getTodayDateKey(day)
    const dayItems = items.filter((item) => item.date === key)
    const replans = records.filter((record) => record.date === key)
    return {
      date: key, planned: getCoverage(dayItems, FULL_DAY_RANGE).planned,
      // 实际用时归属事项日期；截断片段没有计时，避免重复计数。
      actual: dayItems.reduce((sum, item) => sum + getActualMinutes(item, now), 0),
      replans: replans.length, reasons: replans.map((record) => record.reason).filter(Boolean)
    }
  })
}
