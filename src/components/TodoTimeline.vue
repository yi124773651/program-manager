<template>
  <section class="schedule" aria-label="时间块日程">
    <div class="schedule-toolbar">
      <div><strong>已规划 {{ (coverage.planned / 60).toFixed(1) }} / {{ (coverage.total / 60).toFixed(1) }} 小时</strong>
        <span class="muted">全天 00:00–24:00 · {{ isWorkday ? `工作时段 ${settings.workStart}–${settings.workEnd}` : '非工作日也可规划' }}</span></div>
      <button @click="scrollToMinute(0)">零点</button>
      <button v-if="nowMinute !== null" @click="scrollToMinute(nowMinute)">此刻</button>
      <button :disabled="!availableGaps.length || store.saving" @click="fillGaps">空白转为备用</button>
      <button :disabled="store.saving" @click="openEditor()">新建时间块</button>
      <button :disabled="store.saving" @click="insertBreak(30)">休息 30 分钟</button>
      <button :disabled="store.saving" @click="insertBreak(60)">休息 60 分钟</button>
      <button :disabled="store.saving" @click="insertBreak()">午饭</button>
      <button :disabled="store.saving || !!store.replanDraft || store.selectedDate !== getTodayDateKey(clock)" @click="beginReplan">从现在重排</button>
    </div>
    <div v-if="store.replanDraft" class="replan-banner" role="status">
      <strong>重排草稿 · {{ minutesToTime(store.replanDraft.anchor) }} 起</strong>
      <span>此前时段和已完成事项已固定；剩余 {{ pool.filter(item => item.remainingMinutes).length }} 项可留在池中。</span>
      <label>打断原因<select v-model="store.replanDraft.reason" :disabled="store.saving"><option :value="undefined">不记录</option><option value="meeting">会议</option><option value="urgent">紧急插入</option><option value="other">其他</option></select></label>
      <button class="primary" :disabled="store.saving" @click="confirmReplan">确认写入</button>
      <button :disabled="store.saving" @click="cancelReplan">取消重排</button>
    </div>
    <div v-if="store.runningTodo" class="running-bar">
      <span>正在计时：{{ store.runningTodo.title }} · {{ getActualMinutes(store.runningTodo, clock.getTime()).toFixed(1) }} 分钟</span>
      <button :disabled="store.saving || !!store.replanDraft" @click="store.setTimer(store.runningTodo.id, false)">停止计时</button>
    </div>
    <details class="week-review">
      <summary>本周回顾（{{ weekReview[0].date }} 至 {{ weekReview[6].date }}）</summary>
      <p class="muted">规划覆盖全天 24 小时；实际用时归属事项日期，仅统计已确认的重排。</p>
      <div class="week-days">
        <div v-for="day in weekReview" :key="day.date">
          <strong>{{ day.date.slice(5) }}</strong>
          <span>规划 {{ (day.planned / 60).toFixed(1) }} 小时</span>
          <span>实际 {{ (day.actual / 60).toFixed(1) }} 小时</span>
          <span>重排 {{ day.replans }} 次</span>
          <small v-if="day.reasons.length">{{ day.reasons.map(reason => reason === 'meeting' ? '会议' : reason === 'urgent' ? '紧急插入' : '其他').join('、') }}</small>
        </div>
      </div>
    </details>
    <p v-if="conflicts.size" class="notice">旧计划中有重叠时段，已标记警告；移动或调整后需要消除冲突。</p>
    <p v-if="message" class="notice" role="alert">{{ message }}</p>
    <div class="schedule-body">
      <div ref="scroller" class="timeline-scroll">
        <div ref="grid" class="time-grid" :style="{ height: `${timelineRange.end * scale}px` }" @pointerdown="beginCreate">
          <div v-if="workRange" class="work-period" :style="rangeStyle(workRange)" aria-label="工作时段"></div>
          <div v-for="minute in rows" :key="minute" class="grid-row" :style="{ top: `${minute * scale}px` }">
            <span>{{ minute % 60 === 0 ? minutesToTime(minute) : '' }}</span>
          </div>
          <div class="grid-row day-end" :style="{ top: `${timelineRange.end * scale}px` }"><span>24:00</span></div>
          <div v-for="gap in coverage.gaps" :key="gap.start" class="gap" :style="rangeStyle(gap)"></div>
          <div v-if="store.replanDraft" class="anchor-line" :style="{ top: `${store.replanDraft.anchor * scale}px` }"><span>重排起点 {{ minutesToTime(store.replanDraft.anchor) }}</span></div>
          <button v-for="entry in layout" :key="entry.item.id" class="time-block" :class="[entry.item.kind || 'task', { completed: entry.item.completed || entry.item.splitFrom, highlighted: highlightedId === entry.item.id, conflict: conflicts.has(entry.item.id) }]"
            :style="{ ...rangeStyle(entry.range), left: `calc(60px + (100% - 66px) * ${entry.lane / lanes})`, width: `calc((100% - 66px) / ${lanes} - 4px)` }"
            :data-todo-id="entry.item.id" :aria-label="`${entry.item.startTime} 至 ${entry.item.endTime} ${entry.item.title}`"
            @pointerdown.stop="beginBlock($event, entry.item, false)" @keydown.enter.prevent="openEditor(entry.item)" @keydown.space.prevent="openEditor(entry.item)">
            <strong>{{ conflicts.has(entry.item.id) ? '⚠ ' : '' }}{{ entry.item.title }}</strong>
            <small>{{ entry.item.startTime }}–{{ entry.item.endTime }}{{ entry.item.completed ? ' · 已完成' : '' }}</small>
            <small v-if="entry.item.subtasks?.length">子任务 {{ entry.item.subtasks.filter(task => task.completed).length }}/{{ entry.item.subtasks.length }}</small>
            <small v-if="entry.item.timerStartedAt">计时中 · {{ getActualMinutes(entry.item, clock.getTime()).toFixed(1) }} 分钟</small>
            <span v-if="!isLocked(entry.item)" class="resize-handle" aria-label="调整时长" @pointerdown.stop="beginBlock($event, entry.item, true)"></span>
          </button>
          <div v-if="preview" class="drag-preview" :style="rangeStyle(preview)">{{ minutesToTime(preview.start) }}–{{ minutesToTime(preview.end) }}</div>
          <div v-if="nowMinute !== null" class="now-line" :style="{ top: `${nowMinute * scale}px` }"><span>{{ minutesToTime(nowMinute) }}</span></div>
        </div>
      </div>
      <aside class="side-panel">
        <template v-if="editor">
          <div class="panel-heading"><strong>{{ editingId ? '时间块详情' : '新建时间块' }}</strong><button @click="editor = null">收起</button></div>
          <form class="editor" @submit.prevent="saveEditor">
            <fieldset :disabled="store.saving || selectedLocked">
              <label>标题<input ref="titleInput" v-model="editor.title" aria-label="时间块标题" required /></label>
              <label>类型<select v-model="editor.kind"><option value="task">活动</option><option value="buffer">备用</option><option value="break">休息 / 午饭</option></select></label>
              <label>日期<input v-model="editor.date" type="date" required :disabled="!!store.replanDraft" /></label>
              <label>开始<input v-model="editor.startTime" aria-label="时间块开始" type="time" step="900" /></label>
              <label>结束<TodoEndTimeInput v-model="editor.endTime" label="时间块结束" /></label>
              <label>说明<textarea v-model="editor.description" rows="3" /></label>
              <p v-if="!editingId && editor.kind === 'task'" class="muted">{{ suggestion ? `根据 ${suggestion.samples} 个计时样本，建议预留 ${suggestion.minutes} 分钟。` : '暂无已结算的活动计时样本，完成计时后会提供预留建议。' }}</p>
              <button class="primary">{{ store.saving ? '保存中…' : store.replanDraft ? '保存到草稿' : '保存时间块' }}</button>
              <button v-if="editingId" type="button" @click="unschedule">移回未排期池</button>
            </fieldset>
          </form>
          <p v-if="selectedLocked" class="muted">该时段已固定，保留原安排。</p>
          <div v-if="selectedItem && !selectedLocked" class="editor-actions">
            <button :disabled="store.saving" @click="store.toggleTodo(selectedItem.id)">{{ selectedItem.completed ? '恢复未完成' : '标记完成' }}</button>
            <button :disabled="store.saving" @click="removeSelected">删除事项</button>
          </div>
          <div v-if="selectedItem && !selectedItem.splitFrom" class="timer-panel">
            <span>预计 {{ selectedItem.estimatedMinutes ?? 0 }} 分钟 · 实际 {{ getActualMinutes(selectedItem, clock.getTime()).toFixed(1) }} 分钟</span>
            <button :disabled="store.saving || !!store.replanDraft || selectedItem.completed" @click="store.setTimer(selectedItem.id, !selectedItem.timerStartedAt)">{{ selectedItem.timerStartedAt ? '停止计时' : '开始计时' }}</button>
          </div>
          <div v-if="selectedItem && !selectedItem.splitFrom" class="subtasks">
            <strong>子任务 {{ selectedItem.subtasks?.filter(task => task.completed).length ?? 0 }}/{{ selectedItem.subtasks?.length ?? 0 }}</strong>
            <div v-for="task in selectedItem.subtasks" :key="task.id" class="subtask-row">
              <label><input type="checkbox" :disabled="store.saving || selectedLocked" :checked="task.completed" @change="store.changeSubtask(selectedItem.id, task.id)" />{{ task.title }}</label>
              <button :disabled="store.saving || selectedLocked" :aria-label="`删除子任务 ${task.title}`" @click="store.changeSubtask(selectedItem.id, task.id, true)">×</button>
            </div>
            <form v-if="!selectedLocked" @submit.prevent="addSubtask"><input v-model="subtaskTitle" aria-label="子任务标题" placeholder="输入子任务" /><button :disabled="store.saving || !subtaskTitle.trim()">添加</button></form>
            <template v-if="!selectedLocked && !selectedItem.completed && selectedItem.kind === 'buffer' && pool.some(item => !item.completed)">
              <label>备用时间改作<select v-model="replacementId"><option value="">选择未排期事项</option><option v-for="item in pool.filter(item => !item.completed)" :key="item.id" :value="item.id">{{ item.title }}</option></select></label>
              <button :disabled="!replacementId || store.saving" @click="replaceBuffer">安排到这段备用时间</button>
            </template>
          </div>
        </template>
        <div class="pool">
          <strong>{{ store.replanDraft ? '待重排 / 未排期' : '未排期' }} · {{ pool.length }}</strong>
          <p class="muted">拖入左侧时段，或点击编辑时间。</p>
          <button v-for="item in pool" :key="item.id" :data-todo-id="item.id" :class="{ highlighted: highlightedId === item.id }" @pointerdown="beginPool($event, item)" @keydown.enter.prevent="openEditor(item)" @keydown.space.prevent="openEditor(item)">
            {{ item.title }}<small>{{ item.remainingMinutes ? `待安排 ${item.remainingMinutes} 分钟` : item.startTime ? `${item.startTime} 开始，待补结束时间` : '未设置时间' }}{{ item.completed ? ' · 已完成' : '' }}</small>
          </button>
          <p v-if="!pool.length" class="muted">当日事项都已排期。</p>
        </div>
      </aside>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { ask } from '@tauri-apps/plugin-dialog'
import TodoEndTimeInput from './TodoEndTimeInput.vue'
import { useTodoStore } from '@/stores/todoStore'
import { useAppStore } from '@/stores/appStore'
import { getTodayDateKey, type TodoInput, type TodoItem } from '@/types/todo'
import { FULL_DAY_RANGE, getActualMinutes, getConflictIds, getCoverage, getEstimateSuggestion, getTodoRange, getWeekReview, minutesToTime, normalizeScheduleSettings, snapMinutes, type TimeRange } from '@/services/todoScheduleService'

const props = defineProps<{ highlightedId?: string | null }>()
const store = useTodoStore()
const appStore = useAppStore()
const settings = computed(() => normalizeScheduleSettings(appStore.settings.todoSchedule))
const timelineRange = FULL_DAY_RANGE
const isWorkday = computed(() => settings.value.workDays.includes(new Date(`${store.selectedDate}T00:00:00`).getDay()))
const workRange = computed(() => isWorkday.value ? getTodoRange({ startTime: settings.value.workStart, endTime: settings.value.workEnd }) : null)
const dayItems = computed(() => store.scheduleItems.filter((item) => item.date === store.selectedDate))
const coverage = computed(() => getCoverage(dayItems.value, timelineRange))
const availableGaps = computed(() => coverage.value.gaps.map((gap) => ({ start: Math.max(gap.start, store.replanDraft?.anchor ?? 0), end: gap.end })).filter((gap) => gap.end > gap.start))
const conflicts = computed(() => getConflictIds(dayItems.value))
const pool = computed(() => dayItems.value.filter((item) => !getTodoRange(item)))
const scale = 1.8
const rows = Array.from({ length: 48 }, (_, index) => index * 30)
const laneEnds = computed(() => {
  const ends: number[] = []
  const entries = dayItems.value.map((item) => ({ item, range: getTodoRange(item) })).filter((entry): entry is { item: TodoItem; range: TimeRange } => !!entry.range)
    .sort((a, b) => a.range.start - b.range.start)
  const entriesWithLane = entries.map((entry) => {
    let lane = ends.findIndex((end) => end <= entry.range.start)
    if (lane < 0) lane = ends.length
    ends[lane] = entry.range.end
    return { ...entry, lane }
  })
  return { entries: entriesWithLane, count: Math.max(1, ends.length) }
})
const layout = computed(() => laneEnds.value.entries)
const lanes = computed(() => laneEnds.value.count)
const clock = ref(new Date())
const tick = setInterval(() => { clock.value = new Date() }, 1000)
const weekReview = computed(() => getWeekReview(store.items, store.replans, store.selectedDate, clock.value.getTime()))
const nowMinute = computed(() => {
  const minute = clock.value.getHours() * 60 + clock.value.getMinutes()
  return store.selectedDate === getTodayDateKey(clock.value) ? minute : null
})
const suggestedStart = computed(() => store.replanDraft?.anchor
  ?? (nowMinute.value !== null ? snapMinutes(nowMinute.value, 30, 'ceil') : workRange.value?.start ?? 540))
const grid = ref<HTMLElement | null>(null)
const scroller = ref<HTMLElement | null>(null)
const titleInput = ref<HTMLInputElement | null>(null)
const editor = ref<TodoInput | null>(null)
const editingId = ref<string | null>(null)
const selectedItem = computed(() => store.scheduleItems.find((item) => item.id === editingId.value))
const selectedLocked = computed(() => !!selectedItem.value && isLocked(selectedItem.value))
const suggestion = computed(() => {
  const range = editor.value && getTodoRange(editor.value)
  return getEstimateSuggestion(store.items, range ? range.end - range.start : 30)
})
const message = ref('')
const preview = ref<TimeRange | null>(null)
const subtaskTitle = ref('')
const replacementId = ref('')
let gesture: { mode: 'create' | 'move' | 'resize' | 'pool'; item?: TodoItem; startY: number; startX: number; startMinute: number; range: TimeRange; moved: boolean } | null = null

function rangeStyle(range: TimeRange) {
  const start = Math.max(timelineRange.start, range.start)
  const end = Math.min(timelineRange.end, range.end)
  return { top: `${start * scale}px`, height: `${Math.max(0, end - start) * scale}px` }
}

function scrollToMinute(minute: number) {
  if (scroller.value) scroller.value.scrollTop = Math.max(0, minute * scale - 60)
}

async function openEditor(item?: TodoItem, range?: TimeRange) {
  message.value = ''
  editingId.value = item?.id ?? null
  const preferredStart = suggestedStart.value
  const gap = availableGaps.value.find((gap) => gap.end - Math.max(gap.start, preferredStart) >= 30)
    ?? availableGaps.value.find((gap) => gap.end - gap.start >= 30)
  const start = range?.start ?? (gap ? Math.max(gap.start, Math.min(preferredStart, gap.end - 30)) : preferredStart)
  editor.value = item ? { title: item.title, date: item.date, startTime: item.startTime, endTime: item.endTime, description: item.description, kind: item.kind } : {
    title: '', date: store.selectedDate, startTime: start <= 1410 ? minutesToTime(start) : undefined, endTime: start <= 1410 ? minutesToTime(range?.end ?? start + 30) : undefined, description: '', kind: 'task'
  }
  await nextTick()
  titleInput.value?.focus({ preventScroll: true })
}

async function saveEditor() {
  if (!editor.value) return
  const result = editingId.value ? await store.updateTodo(editingId.value, editor.value) : await store.addTodo(editor.value)
  if (result) {
    if (typeof result === 'string') editingId.value = result
    message.value = store.replanDraft ? '已保存到重排草稿，确认后写入。' : '已保存。'
  } else message.value = store.lastError
}

async function unschedule() {
  if (editingId.value && await store.updateTodo(editingId.value, { startTime: undefined, endTime: undefined })) {
    editor.value = null
  } else message.value = store.lastError
}

async function removeSelected() {
  if (!editingId.value || !await ask('确定删除此事项及其子任务吗？', { title: '删除事项', kind: 'warning' })) return
  if (await store.deleteTodo(editingId.value)) editor.value = null
  else message.value = store.lastError
}

async function fillGaps() {
  if (!await store.fillScheduleGaps(store.selectedDate, availableGaps.value)) message.value = store.lastError
}

async function insertBreak(duration?: number) {
  // 全天视图从零点开始，但快捷休息优先安排在当前时刻之后，避免落到已过去的凌晨。
  const range = duration
    ? availableGaps.value.map((gap) => ({ start: Math.max(gap.start, suggestedStart.value), end: gap.end })).find((gap) => gap.end - gap.start >= duration)
    : getTodoRange({ startTime: settings.value.lunchStart, endTime: settings.value.lunchEnd })
  if (!range) { message.value = '当天后续时段没有足够空白，可点击时间轴手动安排。'; return }
  if (!await store.addTodo({ title: duration ? '休息' : '午饭', date: store.selectedDate, startTime: minutesToTime(range.start), endTime: minutesToTime(duration ? range.start + duration : range.end), kind: 'break' })) message.value = store.lastError
}

async function addSubtask() {
  if (selectedItem.value && await store.addSubtask(selectedItem.value.id, subtaskTitle.value)) subtaskTitle.value = ''
  else message.value = store.lastError
}

async function replaceBuffer() {
  if (selectedItem.value && ((selectedItem.value.actualMinutes ?? 0) > 0 || selectedItem.value.subtasks?.length)) {
    if (!await ask('转换会移除此备用块及其子任务和计时记录，保留所选待办的内容。确定转换吗？', { title: '转换备用时间', kind: 'warning' })) return
  }
  if (selectedItem.value && await store.replaceBuffer(selectedItem.value.id, replacementId.value)) {
    const item = store.scheduleItems.find((item) => item.id === replacementId.value)
    if (item) await openEditor(item)
    replacementId.value = ''
  } else message.value = store.lastError
}

function pointerMinute(event: PointerEvent) {
  return (event.clientY - (grid.value?.getBoundingClientRect().top ?? event.clientY)) / scale
}

function isLocked(item: TodoItem) { return !!item.splitFrom || !!store.replanDraft?.fixedIds.includes(item.id) }

async function beginReplan() {
  if (await store.beginReplan()) { editor.value = null; message.value = ''; cancelPointer() }
  else message.value = store.lastError
}

async function confirmReplan() {
  if (await store.confirmReplan()) { editor.value = null; message.value = '重排已保存。' }
  else message.value = store.lastError
}

function cancelReplan() { store.cancelReplan(); editor.value = null; message.value = ''; cancelPointer() }

function beginCreate(event: PointerEvent) {
  if (event.button !== 0 || store.saving) return
  event.preventDefault()
  const lower = store.replanDraft?.anchor ?? 0
  if (lower > timelineRange.end - 30) { message.value = '当天已无可重排空间，请安排明天。'; return }
  const minute = Math.max(lower, Math.min(timelineRange.end - 30, snapMinutes(pointerMinute(event), settings.value.snapMinutes, 'floor')))
  gesture = { mode: 'create', startY: event.clientY, startX: event.clientX, startMinute: minute, range: { start: minute, end: Math.min(timelineRange.end, minute + 30) }, moved: false }
}

function beginBlock(event: PointerEvent, item: TodoItem, resize: boolean) {
  if (event.button !== 0 || store.saving) return
  event.preventDefault()
  if (isLocked(item)) { void openEditor(item); return }
  gesture = { mode: resize ? 'resize' : 'move', item, startY: event.clientY, startX: event.clientX, startMinute: pointerMinute(event), range: getTodoRange(item)!, moved: false }
}

function beginPool(event: PointerEvent, item: TodoItem) {
  if (event.button !== 0 || store.saving) return
  event.preventDefault()
  if (isLocked(item)) { void openEditor(item); return }
  gesture = { mode: 'pool', item, startY: event.clientY, startX: event.clientX, startMinute: 0, range: { start: 0, end: item.remainingMinutes ?? 30 }, moved: false }
}

function movePointer(event: PointerEvent) {
  if (!gesture || !grid.value) return
  if (Math.abs(event.clientY - gesture.startY) + Math.abs(event.clientX - gesture.startX) < 5 && !gesture.moved) return
  gesture.moved = true
  const rect = scroller.value?.getBoundingClientRect()
  if (rect && scroller.value) {
    if (event.clientY > rect.bottom - 30) scroller.value.scrollTop += 14
    if (event.clientY < rect.top + 30) scroller.value.scrollTop -= 14
  }
  const minute = pointerMinute(event)
  const step = settings.value.snapMinutes
  const lower = store.replanDraft?.anchor ?? 0
  let { start, end } = gesture.range
  if (gesture.mode === 'create') {
    start = Math.max(lower, Math.min(gesture.startMinute, snapMinutes(minute, step, 'floor')))
    end = Math.min(timelineRange.end, Math.max(gesture.startMinute + 30, snapMinutes(minute, step, 'ceil')))
  } else if (gesture.mode === 'resize') {
    end = Math.max(start + 30, Math.min(timelineRange.end, snapMinutes(minute, step)))
  } else {
    const duration = end - start
    start = gesture.mode === 'pool' ? snapMinutes(minute, step, 'floor') : start + snapMinutes(minute - gesture.startMinute, step)
    start = Math.max(lower, Math.min(timelineRange.end - duration, start))
    end = start + duration
  }
  preview.value = { start, end }
}

async function endPointer(event: PointerEvent) {
  if (!gesture) return
  const current = gesture
  const range = preview.value ?? current.range
  gesture = null
  preview.value = null
  if (!current.moved) { await openEditor(current.item, current.mode === 'create' ? range : undefined); return }
  const rect = grid.value?.getBoundingClientRect()
  if (!rect || event.clientX < rect.left + 54 || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return
  if (range.end <= range.start || range.start < timelineRange.start || range.end > timelineRange.end) { message.value = '该事项长于可安排时段，请在详情中调整。'; return }
  if (current.mode === 'create') await openEditor(undefined, range)
  else if (current.item && !await store.updateTodo(current.item.id, { startTime: minutesToTime(range.start), endTime: minutesToTime(range.end) })) message.value = store.lastError
}

function cancelPointer() { gesture = null; preview.value = null }
document.addEventListener('pointermove', movePointer)
document.addEventListener('pointerup', endPointer)
document.addEventListener('pointercancel', cancelPointer)
watch(() => store.selectedDate, async () => {
  editor.value = null
  message.value = ''
  cancelPointer()
  await nextTick()
  const highlighted = store.scheduleItems.find((item) => item.id === props.highlightedId)
  scrollToMinute((highlighted && getTodoRange(highlighted)?.start) ?? nowMinute.value ?? workRange.value?.start ?? 540)
}, { immediate: true })
watch(() => props.highlightedId, async (id) => {
  const item = store.scheduleItems.find((item) => item.id === id)
  if (item) await openEditor(item)
}, { immediate: true })
watch(selectedItem, (item, previous) => {
  if (item && editor.value && (item.startTime !== previous?.startTime || item.endTime !== previous?.endTime)) {
    editor.value.startTime = item.startTime
    editor.value.endTime = item.endTime
  }
})
watch(() => store.saving, (saving) => { if (saving) message.value = '' })
onBeforeUnmount(() => {
  clearInterval(tick)
  document.removeEventListener('pointermove', movePointer)
  document.removeEventListener('pointerup', endPointer)
  document.removeEventListener('pointercancel', cancelPointer)
})
</script>

<style scoped>
.schedule { display: flex; flex-direction: column; flex: 1; gap: 10px; min-height: 0; color: var(--text-primary); }
.schedule-toolbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; font-size: 13px; }
.schedule-toolbar > div { margin-right: auto; } .muted { color: var(--text-secondary); font-size: 12px; } .schedule-toolbar .muted { display: block; margin-top: 4px; }
button, input, textarea, select { font: inherit; color: var(--text-primary); background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 7px; padding: 7px 9px; }
button { cursor: pointer; } button:hover { background: var(--card-hover-bg); } button:disabled { opacity: .5; cursor: default; } button:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
.notice { padding: 8px 10px; border-left: 3px solid var(--warning-color); background: var(--bg-secondary); margin: 0; font-size: 12px; }
.schedule-body { display: flex; flex: 1; min-height: 240px; gap: 14px; }
.timeline-scroll { flex: 1; min-width: 190px; overflow-y: auto; overflow-x: hidden; border: 1px solid var(--border-color); border-radius: 10px; background: var(--bg-primary); }
.time-grid { position: relative; margin: 16px 6px 20px 0; touch-action: none; user-select: none; }
.grid-row { position: absolute; left: 0; right: 0; height: 54px; pointer-events: none; }
.grid-row::after { content: ''; position: absolute; top: 0; left: 56px; right: 0; border-top: 1px solid var(--border-color); }
.grid-row span { position: relative; top: -8px; padding-left: 8px; font-size: 11px; color: var(--text-secondary); }
.grid-row.day-end { height: 0; }
.work-period { position: absolute; left: 56px; right: 0; background: var(--primary-color); opacity: .06; pointer-events: none; }
.gap { position: absolute; left: 56px; right: 0; pointer-events: none; background: repeating-linear-gradient(135deg, transparent 0, transparent 7px, var(--border-color) 7px, var(--border-color) 8px); opacity: .3; }
.time-block { position: absolute; z-index: 2; padding: 5px 9px; text-align: left; border-left: 4px solid var(--primary-color); border-radius: 6px; overflow: hidden; display: flex; flex-direction: column; gap: 2px; touch-action: none; cursor: grab; }
.time-block strong { font-size: 13px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; width: 100%; } .time-block small { font-size: 11px; white-space: nowrap; }
.time-block.buffer { border-left-color: var(--warning-color); background: var(--bg-secondary); } .time-block.break { border-left-color: var(--success-color); background: var(--bg-tertiary); }
.time-block.completed { background: var(--bg-tertiary); color: var(--text-secondary); border-left-color: var(--text-secondary); } .time-block.completed strong { text-decoration: line-through; }
.time-block.conflict { border-style: dashed; border-color: var(--warning-color); }
.resize-handle { position: absolute; bottom: 0; left: 0; right: 0; height: 9px; cursor: ns-resize; background: var(--border-color); opacity: .55; }
.highlighted { outline: 3px solid var(--primary-color); outline-offset: -1px; }
.drag-preview { position: absolute; left: 56px; right: 0; z-index: 4; border: 2px dashed var(--primary-color); background: var(--bg-secondary); opacity: .85; pointer-events: none; padding: 6px; font-size: 12px; }
.now-line { position: absolute; z-index: 5; left: 56px; right: 0; border-top: 2px solid var(--danger-color); pointer-events: none; } .now-line span { position: absolute; right: 0; bottom: 2px; font-size: 10px; color: var(--text-primary); background: var(--bg-primary); padding: 1px 3px; }
.side-panel { width: 235px; flex-shrink: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; padding: 1px 3px; }
.panel-heading { display: flex; justify-content: space-between; align-items: center; font-size: 13px; }
.editor { display: grid; gap: 9px; font-size: 12px; } .editor label { display: grid; gap: 4px; } .editor input, .editor textarea { min-width: 0; width: 100%; }
.primary { background: var(--primary-color); color: white; } .editor-actions { display: flex; flex-wrap: wrap; gap: 5px; font-size: 12px; }
.pool { display: grid; gap: 8px; font-size: 13px; } .pool p { margin: 0; } .pool button { text-align: left; touch-action: none; } .pool small { display: block; color: var(--text-secondary); margin-top: 3px; font-size: 11px; }
.subtasks { display: grid; gap: 8px; font-size: 12px; }
.subtask-row, .subtasks form { display: flex; gap: 5px; align-items: center; }
.subtask-row label { flex: 1; overflow-wrap: anywhere; } .subtasks form input { min-width: 0; flex: 1; }
.subtasks select { max-width: 100%; margin-top: 5px; }
.editor fieldset { border: 0; padding: 0; margin: 0; display: grid; gap: 9px; min-width: 0; }
.replan-banner, .running-bar { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding: 8px; background: var(--bg-secondary); border: 1px solid var(--primary-color); border-radius: 8px; font-size: 12px; }
.timer-panel { display: grid; gap: 7px; font-size: 12px; }
.week-review { font-size: 12px; flex-shrink: 0; } .week-review summary { cursor: pointer; }
.week-days { display: grid; grid-template-columns: repeat(7, minmax(90px, 1fr)); overflow: auto; gap: 6px; max-height: 145px; }
.week-days > div { display: grid; gap: 4px; padding: 6px; background: var(--bg-secondary); border-radius: 6px; }
.anchor-line { position: absolute; left: 56px; right: 0; border-top: 2px dashed var(--primary-color); z-index: 5; pointer-events: none; }
.anchor-line span { position: absolute; bottom: 2px; padding: 2px; background: var(--bg-primary); font-size: 11px; }
@media (max-width: 950px) { .side-panel { width: 205px; } }
</style>
