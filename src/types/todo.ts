export type TodoBlockKind = 'task' | 'buffer' | 'break'

export interface TodoSubtask {
  id: string
  title: string
  completed: boolean
}

export interface TodoScheduleSettings {
  // 工作时段仅用于背景提示，每天的可规划范围固定为 00:00–24:00。
  workDays: number[]
  workStart: string
  workEnd: string
  snapMinutes: 30 | 60
  lunchStart: string
  lunchEnd: string
}

export const DEFAULT_TODO_SCHEDULE: TodoScheduleSettings = {
  workDays: [1, 2, 3, 4, 5],
  workStart: '09:00',
  workEnd: '18:00',
  snapMinutes: 30,
  lunchStart: '12:00',
  lunchEnd: '13:00'
}

export interface TodoItem {
  id: string
  title: string
  date: string
  startTime?: string
  // 当天结束边界允许 24:00；开始时间仍为 00:00–23:59。
  endTime?: string
  description: string
  completed: boolean
  createdAt: number
  updatedAt: number
  completedAt?: number
  kind?: TodoBlockKind
  subtasks?: TodoSubtask[]
  actualMinutes?: number
  timerStartedAt?: number
  estimatedMinutes?: number
  // 重排前已过去的时段归属原事项，不复制子任务与实际用时。
  splitFrom?: string
  remainingMinutes?: number
}

export interface TodoInput {
  title: string
  date: string
  startTime?: string
  endTime?: string
  description?: string
  kind?: TodoBlockKind
  subtasks?: TodoSubtask[]
}

export interface TodoReplanRecord {
  date: string
  at: number
  anchor: number
  reason?: 'meeting' | 'urgent' | 'other'
}

export interface TodoReplanDraft {
  date: string
  anchor: number
  items: TodoItem[]
  original: string
  fixedIds: string[]
  reason?: TodoReplanRecord['reason']
}

export const getTodayDateKey = (now = new Date()): string => {
  const year = now.getFullYear()
  const month = `${now.getMonth() + 1}`.padStart(2, '0')
  const day = `${now.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}
