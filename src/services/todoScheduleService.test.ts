import { describe, expect, it } from 'vitest'
import { DEFAULT_TODO_SCHEDULE, type TodoItem } from '@/types/todo'
import { normalizeTodoItem } from '@/stores/todoStore'
import { FULL_DAY_RANGE, consumeFollowingBuffer, createReplanDraft, getActualMinutes, getCoverage, getConflictIds, getEstimateSuggestion, getTodoRange, getWeekReview, minutesToTime, snapMinutes, timeToMinutes, validateReplanChanges, validateScheduleSettings, validateTodoSchedule } from './todoScheduleService'

const item = (id: string, startTime?: string, endTime?: string): TodoItem => ({ id, title: id, date: '2026-11-03', startTime, endTime, description: '', completed: false, createdAt: 0, updatedAt: 0 })

describe('时间块计算', () => {
  it('合并重叠、裁剪时段外安排，所有块类型和完成状态都计入覆盖', () => {
    const items = [item('早', '08:00', '10:00'), item('重叠', '09:15', '10:30'), { ...item('午饭', '12:00', '13:00'), kind: 'break' as const }, { ...item('完成', '17:00', '19:00'), completed: true }]
    expect(getCoverage(items, { start: 540, end: 1080 })).toEqual({ total: 540, planned: 210, gaps: [{ start: 630, end: 720 }, { start: 780, end: 1020 }] })
  })
  it('无时间、零时长和跨午夜数据不作为完整时间块', () => {
    expect(getTodoRange(item('开始', '09:15'))).toBeNull()
    expect(getTodoRange(item('零', '09:00', '09:00'))).toBeNull()
    expect(getTodoRange(item('跨夜', '23:00', '01:00'))).toBeNull()
    expect(getCoverage([], { start: 540, end: 1080 }).gaps).toEqual([{ start: 540, end: 1080 }])
    expect(getCoverage([item('全日', '00:00', '23:59')], { start: 0, end: 0 }).total).toBe(0)
  })
  it('相邻时段不冲突，嵌套和多个重叠都标出，仅比较同一天', () => {
    expect([...getConflictIds([item('甲', '09:00', '10:00'), item('乙', '10:00', '11:00')])]).toEqual([])
    expect([...getConflictIds([item('甲', '09:00', '12:00'), item('乙', '09:30', '10:00'), item('丙', '11:00', '13:00')])].sort()).toEqual(['丙', '乙', '甲'].sort())
    expect(getConflictIds([item('甲', '09:00', '10:00'), { ...item('乙', '09:00', '10:00'), date: '2026-11-04' }]).size).toBe(0)
  })
  it('吸附和锚点向上取整不会改写原有分钟精度', () => {
    expect(snapMinutes(547)).toBe(540)
    expect(snapMinutes(541, 30, 'ceil')).toBe(570)
    expect(snapMinutes(570, 30, 'ceil')).toBe(570)
    expect(timeToMinutes('09:15')).toBe(555)
    expect(timeToMinutes('25:00')).toBeNull()
    expect(timeToMinutes('09:99')).toBeNull()
  })
  it('旧 time 字段保持精度，扩展字段有默认值，当前字段优先', () => {
    const legacy = normalizeTodoItem({ ...item('旧'), time: '09:15' })
    expect(legacy.startTime).toBe('09:15')
    expect(legacy.endTime).toBeUndefined()
    expect(legacy.kind).toBe('task')
    expect(legacy.subtasks).toEqual([])
    expect(legacy.actualMinutes).toBe(0)
    expect(normalizeTodoItem({ ...item('新', '10:15', '11:00'), time: '09:00' }).startTime).toBe('10:15')
  })
  it('拒绝冲突和无效时间，仍接受只设置开始时间的待办', () => {
    expect(() => validateTodoSchedule(item('乙', '09:15', '10:15'), [item('甲', '09:00', '10:00')])).toThrow('甲')
    expect(() => validateTodoSchedule(item('乙', undefined, '10:00'), [])).toThrow('开始时间')
    expect(() => validateTodoSchedule(item('乙', '23:00', '01:00'), [])).toThrow('跨午夜')
    expect(() => validateTodoSchedule(item('乙', '09:15'), [])).not.toThrow()
  })
  it('设置校验支持非工作日与分钟精度，拒绝跨午夜', () => {
    expect(validateScheduleSettings({ ...DEFAULT_TODO_SCHEDULE, workDays: [], workStart: '09:15' })).toBe('')
    expect(validateScheduleSettings({ ...DEFAULT_TODO_SCHEDULE, workEnd: '08:00' })).toContain('结束时间')
  })
  it('拒绝不存在的日期，接受闰年日期', () => {
    expect(() => validateTodoSchedule({ ...item('日期'), date: '2026-02-30' }, [])).toThrow('有效日期')
    expect(() => validateTodoSchedule({ ...item('日期'), date: '2028-02-29' }, [])).not.toThrow()
  })
  it('全天覆盖包含凌晨与最后半小时，24:00 不被截成 23:59', () => {
    expect(timeToMinutes('24:00')).toBe(1440)
    expect(minutesToTime(1440)).toBe('24:00')
    expect(timeToMinutes('24:01')).toBeNull()
    expect(getTodoRange(item('全天', '00:00', '24:00'))).toEqual(FULL_DAY_RANGE)
    const items = [item('睡眠', '00:00', '08:00'), item('工作', '09:00', '18:00'), item('夜间', '23:30', '24:00')]
    expect(getCoverage(items, FULL_DAY_RANGE)).toEqual({ total: 1440, planned: 1050, gaps: [{ start: 480, end: 540 }, { start: 1080, end: 1410 }] })
    expect(getCoverage([item('全天', '00:00', '24:00')], FULL_DAY_RANGE)).toEqual({ total: 1440, planned: 1440, gaps: [] })
  })
  it('24:00 只允许作为结束边界，次日零点不能写为当天的开始时间', () => {
    expect(() => validateTodoSchedule(item('夜间', '23:30', '24:00'), [])).not.toThrow()
    expect(() => validateTodoSchedule(item('次日', '24:00'), [])).toThrow('开始时间')
    expect(() => validateTodoSchedule(item('跨日', '23:30', '00:30'), [])).toThrow('跨午夜')
    expect(getTodoRange(item('无效', '24:00', '24:00'))).toBeNull()
    expect(validateScheduleSettings({ ...DEFAULT_TODO_SCHEDULE, workStart: '00:00', workEnd: '24:00' })).toBe('')
  })
})

describe('备用块与重排', () => {
  it('延长任务能完整消耗当天最后一段备用时间', () => {
    const items = [item('任务', '22:00', '23:00'), { ...item('备用', '23:00', '24:00'), kind: 'buffer' as const }]
    const result = consumeFollowingBuffer(items, '任务', '24:00')
    expect(result).toHaveLength(1)
    expect(result[0].endTime).toBe('24:00')
    expect(getTodoRange(result[0])).toEqual({ start: 1320, end: 1440 })
  })
  it('延长任务只消耗紧邻备用块，耗尽时删除，原输入不变', () => {
    const items = [item('任务', '09:00', '10:00'), { ...item('备用', '10:00', '11:00'), kind: 'buffer' as const }]
    const partial = consumeFollowingBuffer(items, '任务', '10:30')
    expect(partial[0].endTime).toBe('10:30')
    expect(partial[1].startTime).toBe('10:30')
    expect(items[1].startTime).toBe('10:00')
    expect(consumeFollowingBuffer(items, '任务', '11:00').map(todo => todo.id)).toEqual(['任务'])
    expect(() => consumeFollowingBuffer(items, '任务', '11:30')).toThrow('超过')
  })
  it('不越过其他事项占用备用，仍允许延长到空白', () => {
    const items = [item('任务', '09:00', '10:00'), item('会议', '10:00', '10:30'), { ...item('备用', '10:30', '11:30'), kind: 'buffer' as const }]
    expect(() => consumeFollowingBuffer(items, '任务', '11:00')).toThrow('会议')
    expect(consumeFollowingBuffer([items[0]], '任务', '10:30')[0].endTime).toBe('10:30')
  })
  it('跨锚点拆分保留原标识和子任务，已完成及锚点前事项完全不变', async () => {
    const crossing = { ...item('跨越', '09:00', '11:00'), subtasks: [{ id: '子项', title: '材料', completed: false }], actualMinutes: 25, timerStartedAt: 123 }
    const done = { ...item('完成', '09:30', '10:30'), completed: true }
    const past = item('过去', '08:00', '09:00')
    const future = item('未来', '13:00', '14:00')
    const original = [crossing, done, past, future]
    const snapshot = JSON.stringify(original)
    const draft = await createReplanDraft(original, '2026-11-03', new Date('2026-11-03T09:30:01'), async () => '片段')
    expect(draft.anchor).toBe(600)
    expect(draft.items.find(todo => todo.id === '跨越')).toMatchObject({ id: '跨越', remainingMinutes: 60, subtasks: crossing.subtasks, actualMinutes: 25, timerStartedAt: 123, estimatedMinutes: 120 })
    expect(draft.items.find(todo => todo.id === '跨越')?.startTime).toBeUndefined()
    expect(draft.items.find(todo => todo.id === '片段')).toMatchObject({ splitFrom: '跨越', startTime: '09:00', endTime: '10:00', actualMinutes: 0, subtasks: [] })
    expect(draft.items.find(todo => todo.id === '完成')).toEqual(done)
    expect(draft.items.find(todo => todo.id === '过去')).toEqual(past)
    expect(draft.items.find(todo => todo.id === '未来')?.remainingMinutes).toBe(60)
    expect(draft.fixedIds).toEqual(expect.arrayContaining(['完成', '过去', '片段']))
    expect(JSON.stringify(original)).toBe(snapshot)
  })
  it('整点锚点、午夜边界以及重复重排不复制已过去片段', async () => {
    const first = await createReplanDraft([item('任务', '09:15', '10:15')], '2026-11-03', new Date('2026-11-03T10:00:00'), async () => '片段')
    expect(first.items.find(todo => todo.id === '任务')?.remainingMinutes).toBe(15)
    const again = await createReplanDraft(first.items, first.date, new Date('2026-11-03T10:00:00'), async () => '不应新增')
    expect(again.items).toHaveLength(2)
    await expect(createReplanDraft([], first.date, new Date('2026-11-03T23:45:00'), async () => '标识')).rejects.toThrow('明天')
    await expect(createReplanDraft([], '2026-11-04', new Date('2026-11-03T10:00:00'), async () => '标识')).rejects.toThrow('今天')
  })
  it('草稿禁止修改固定事项或侵入锚点前，允许剩余事项排到时段外', async () => {
    const draft = await createReplanDraft([item('过去', '08:00', '09:00'), item('任务', '13:00', '14:00')], '2026-11-03', new Date('2026-11-03T10:00:00'), async () => '片段')
    expect(() => validateReplanChanges(draft.items.filter(todo => todo.id !== '过去'), draft)).toThrow('保持不变')
    const placed = draft.items.map(todo => todo.id === '任务' ? { ...todo, startTime: '09:00', endTime: '10:00' } : todo)
    expect(() => validateReplanChanges(placed, draft)).toThrow('锚点之后')
    placed[1].startTime = '19:00'
    placed[1].endTime = '20:00'
    expect(() => validateReplanChanges(placed, draft)).not.toThrow()
  })
})

describe('计时参考与周回顾', () => {
  it('运行计时按时间戳计算，时钟回拨不扣减已累计用时', () => {
    expect(getActualMinutes({ ...item('任务'), actualMinutes: 10, timerStartedAt: 60000 }, 150000)).toBe(11.5)
    expect(getActualMinutes({ ...item('任务'), actualMinutes: 10, timerStartedAt: 60000 }, 30000)).toBe(10)
  })
  it('中位数处理奇偶样本，忽略备用、运行中、片段及无效样本', () => {
    const sample = (id: string, actualMinutes: number): TodoItem => ({ ...item(id), estimatedMinutes: 30, actualMinutes })
    expect(getEstimateSuggestion([], 30)).toBeNull()
    expect(getEstimateSuggestion([sample('甲', 30), sample('乙', 90)], 30)).toMatchObject({ ratio: 2, minutes: 60 })
    const samples = [sample('甲', 30), sample('乙', 45), sample('丙', 900), { ...sample('运行', 999), timerStartedAt: 1 }, { ...sample('备用', 999), kind: 'buffer' as const }, { ...sample('片段', 999), splitFrom: '甲' }, sample('异常', Infinity)]
    expect(getEstimateSuggestion(samples, 30)).toEqual({ samples: 3, ratio: 1.5, minutes: 60 })
  })
  it('周回顾以周一开始、跨年不漏天，周末规划也计入全天覆盖', () => {
    const todo = { ...item('周日', '09:00', '10:00'), date: '2027-01-03', actualMinutes: 90 }
    const week = getWeekReview([todo], [{ date: '2027-01-03', at: 1, anchor: 600, reason: 'urgent' }], '2027-01-03')
    expect(week.map(day => day.date)).toEqual(['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03'])
    expect(week[6]).toMatchObject({ planned: 60, actual: 90, replans: 1, reasons: ['urgent'] })
  })
})
