export interface TodoItem {
  id: string
  title: string
  date: string
  startTime?: string
  endTime?: string
  description: string
  completed: boolean
  createdAt: number
  updatedAt: number
  completedAt?: number
}

export interface TodoInput {
  title: string
  date: string
  startTime?: string
  endTime?: string
  description?: string
}

export const getTodayDateKey = (now = new Date()): string => {
  const year = now.getFullYear()
  const month = `${now.getMonth() + 1}`.padStart(2, '0')
  const day = `${now.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}
