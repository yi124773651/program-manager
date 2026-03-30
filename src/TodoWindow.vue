<template>
  <div class="todo-window">
    <div class="todo-header">
      <div class="header-drag" data-tauri-drag-region>
        <h3>待办日程表</h3>
        <p>{{ selectedDateLabel }}</p>
      </div>
      <div class="header-actions" style="app-region: no-drag;" @mousedown.stop>
        <button class="icon-btn" type="button" @click.stop="focusQuickAdd">新建</button>
        <button
          class="icon-btn"
          type="button"
          :disabled="!hasPastRecords || clearingHistory"
          @click.stop="clearBeforeTodayRecords"
        >
          {{ clearingHistory ? '清理中' : '清理历史' }}
        </button>
        <button class="icon-btn" type="button" @click.stop="closeWindow">关闭</button>
      </div>
    </div>

    <div class="todo-body">
      <aside class="calendar-panel">
        <div class="panel-head">
          <div class="panel-month">{{ monthLabel }}</div>
          <button class="today-btn" @click="selectToday">今天</button>
        </div>

        <div class="weekday-row">
          <span v-for="weekday in weekdays" :key="weekday">{{ weekday }}</span>
        </div>

        <div class="quick-days">
          <button
            v-for="day in quickDays"
            :key="day.key"
            class="quick-day"
            :class="{ active: day.key === selectedDate }"
            @click="todoStore.setSelectedDate(day.key)"
          >
            {{ day.label }}
          </button>
        </div>

        <div class="calendar-grid">
          <button
            v-for="day in calendarDays"
            :key="day.key"
            class="calendar-day"
            :class="{ active: day.key === selectedDate, muted: !day.inCurrentMonth }"
            @click="todoStore.setSelectedDate(day.key)"
          >
            <span>{{ day.day }}</span>
          </button>
        </div>
      </aside>

      <section class="content-panel">
        <form class="quick-add" @submit.prevent="submitTodo">
          <input
            ref="quickInputRef"
            v-model="form.title"
            class="quick-input"
            placeholder="输入事项标题，回车创建"
          />
          <button type="button" class="detail-btn" @click="showDetails = !showDetails">
            {{ showDetails ? '收起详情' : '展开详情' }}
          </button>
          <button type="submit" class="submit-btn" :disabled="!form.title.trim()">添加</button>
        </form>

        <div v-if="showDetails" class="detail-fields">
          <label class="field-group">
            <span>日期</span>
            <input v-model="form.date" type="date" />
          </label>
          <div class="field-group time-range-group">
            <span>时间</span>
            <div class="time-range-fields">
              <input v-model="form.startTime" type="time" step="900" />
              <span class="time-range-separator">至</span>
              <input v-model="form.endTime" type="time" step="900" />
              <button type="button" class="detail-btn secondary-btn" @click="clearTimeRange">清空</button>
            </div>
          </div>
          <label class="field-group description-group">
            <span>任务说明</span>
            <textarea
              v-model="form.description"
              rows="3"
              maxlength="200"
              placeholder="补充备注、会议地点或执行要点"
            />
          </label>
        </div>

        <div v-if="formMessage" class="form-message" :class="{ error: !!formError }">
          {{ formMessage }}
        </div>

        <div
          v-if="!overdueTodos.length && !selectedDateTodos.length && !completedTodos.length"
          class="empty-state"
        >
          <p>这一天还没有事项</p>
          <span>先在上方输入一条待办，或切换左侧日期。</span>
        </div>

        <template v-else>
          <section v-if="overdueTodos.length" class="todo-section">
            <h4>逾期事项</h4>
            <TodoItemRow
              v-for="item in overdueTodos"
              :key="item.id"
              :item="item"
              @toggle="todoStore.toggleTodo(item.id)"
              @remove="todoStore.deleteTodo(item.id)"
              @save="todoStore.updateTodo(item.id, $event)"
            />
          </section>

          <section class="todo-section">
            <h4>{{ selectedDateLabel }}</h4>
            <div v-if="!selectedDateTodos.length" class="section-empty">所选日期暂无未完成事项</div>
            <TodoItemRow
              v-for="item in selectedDateTodos"
              :key="item.id"
              :item="item"
              @toggle="todoStore.toggleTodo(item.id)"
              @remove="todoStore.deleteTodo(item.id)"
              @save="todoStore.updateTodo(item.id, $event)"
            />
          </section>

          <section v-if="completedTodos.length" class="todo-section completed-section">
            <button class="collapse-btn" @click="showCompleted = !showCompleted">
              {{ showCompleted ? '隐藏已完成' : `已完成 (${completedTodos.length})` }}
            </button>
            <div v-if="showCompleted" class="completed-list">
              <TodoItemRow
                v-for="item in completedTodos"
                :key="item.id"
                :item="item"
                @toggle="todoStore.toggleTodo(item.id)"
                @remove="todoStore.deleteTodo(item.id)"
                @save="todoStore.updateTodo(item.id, $event)"
              />
            </div>
          </section>
        </template>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { ask } from '@tauri-apps/plugin-dialog'
import { storeToRefs } from 'pinia'
import { useTodoStore } from '@/stores/todoStore'
import { getTodayDateKey } from '@/types/todo'
import TodoItemRow from '@/components/TodoItemRow.vue'

const weekdays = ['日', '一', '二', '三', '四', '五', '六']

const todoStore = useTodoStore()
const { items, selectedDate, overdueTodos, selectedDateTodos, completedTodos } = storeToRefs(todoStore)
const showCompleted = ref(false)
const showDetails = ref(false)
const closing = ref(false)
const clearingHistory = ref(false)
const formError = ref('')
const historyMessage = ref('')
const quickInputRef = ref<HTMLInputElement | null>(null)
const form = ref<{ title: string; date: string; startTime: string; endTime: string; description: string }>({
  title: '',
  date: '',
  startTime: '',
  endTime: '',
  description: ''
})

const formatDateKey = (date: Date) => {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

const selectedDateLabel = computed(() => new Date(`${selectedDate.value}T00:00:00`).toLocaleDateString('zh-CN', {
  month: 'long',
  day: 'numeric',
  weekday: 'long'
}))

const monthLabel = computed(() => new Date(`${selectedDate.value}T00:00:00`).toLocaleDateString('zh-CN', {
  year: 'numeric',
  month: 'long'
}))

const quickDays = computed(() => {
  const base = new Date()
  return [0, 1, 2].map((offset) => {
    const date = new Date(base)
    date.setDate(base.getDate() + offset)
    const key = formatDateKey(date)

    return {
      key,
      label: offset === 0 ? '今天' : offset === 1 ? '明天' : `${date.getMonth() + 1}/${date.getDate()}`
    }
  })
})

const calendarDays = computed(() => {
  const base = new Date(`${selectedDate.value}T00:00:00`)
  const monthStart = new Date(base.getFullYear(), base.getMonth(), 1)
  const gridStart = new Date(monthStart)
  gridStart.setDate(monthStart.getDate() - monthStart.getDay())

  return Array.from({ length: 42 }, (_, index) => {
    const current = new Date(gridStart)
    current.setDate(gridStart.getDate() + index)

    return {
      key: formatDateKey(current),
      day: current.getDate(),
      inCurrentMonth: current.getMonth() === base.getMonth()
    }
  })
})

const hasPastRecords = computed(() => {
  const today = getTodayDateKey()
  return items.value.some((item) => item.date < today)
})

const formMessage = computed(() => formError.value || historyMessage.value)

const syncFormDate = () => {
  form.value.date = selectedDate.value
}

const clearTimeRange = () => {
  form.value.startTime = ''
  form.value.endTime = ''
}

const submitTodo = () => {
  if (!form.value.title.trim()) return
  formError.value = ''
  historyMessage.value = ''

  if (form.value.endTime && !form.value.startTime) {
    formError.value = '请先设置开始时间，再设置结束时间。'
    return
  }

  if (form.value.startTime && form.value.endTime && form.value.endTime < form.value.startTime) {
    formError.value = '结束时间不能早于开始时间。'
    return
  }

  todoStore.addTodo({
    title: form.value.title,
    date: form.value.date || selectedDate.value,
    startTime: form.value.startTime || undefined,
    endTime: form.value.endTime || undefined,
    description: form.value.description
  })

  form.value.title = ''
  form.value.startTime = ''
  form.value.endTime = ''
  form.value.description = ''
  syncFormDate()
  nextTick(() => quickInputRef.value?.focus())
}

const selectToday = () => {
  const today = quickDays.value[0]
  todoStore.setSelectedDate(today.key)
}

const focusQuickAdd = () => {
  formError.value = ''
  historyMessage.value = ''
  quickInputRef.value?.focus()
}

const clearBeforeTodayRecords = async () => {
  if (!hasPastRecords.value || clearingHistory.value) return

  historyMessage.value = ''
  formError.value = ''
  clearingHistory.value = true

  try {
    const confirmed = await ask('确定清除今天之前的待办记录吗？此操作不可撤销。', {
      title: '清理历史记录',
      kind: 'warning'
    })

    if (!confirmed) return

    const cleared = todoStore.clearBeforeToday()
    historyMessage.value = cleared > 0 ? `已清理 ${cleared} 条历史记录。` : '没有可清理的历史记录。'
  } finally {
    clearingHistory.value = false
  }
}

const closeWindow = async () => {
  if (closing.value) return

  closing.value = true

  try {
    await invoke('hide_todo_window')
  } catch (error) {
    console.error('通过后端隐藏待办窗口失败，尝试前端隐藏:', error)
    try {
      const currentWindow = getCurrentWindow()
      await currentWindow.hide()
    } catch (hideError) {
      console.error('前端隐藏待办窗口失败，尝试强制关闭:', hideError)
      try {
        await getCurrentWindow().destroy()
      } catch (destroyError) {
        console.error('强制关闭待办窗口失败:', destroyError)
      }
    }
  } finally {
    closing.value = false
  }
}

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    event.preventDefault()
    closeWindow()
  }
}

watch(selectedDate, () => {
  syncFormDate()
})

watch(completedTodos, (items) => {
  if (items.length === 0) {
    showCompleted.value = false
  }
})

onMounted(() => {
  todoStore.init()
  syncFormDate()
  quickInputRef.value?.focus()
  document.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<style scoped>
.todo-window {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.88);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.35);
  box-shadow: var(--shadow-xl);
}

.todo-window,
.todo-window * {
  box-sizing: border-box;
}

@media (prefers-color-scheme: dark) {
  .todo-window {
    background: rgba(30, 30, 30, 0.88);
    border-color: rgba(255, 255, 255, 0.12);
  }
}

.todo-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
  cursor: move;
  user-select: none;
}

.header-drag {
  flex: 1;
  min-width: 0;
}

.header-drag h3,
.header-drag p {
  margin: 0;
}

*[data-tauri-drag-region] {
  app-region: drag;
}

.header-actions,
.header-actions * {
  app-region: no-drag;
}

.header-drag h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.header-drag p {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

.header-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
  position: relative;
  z-index: 2;
}

.todo-body {
  flex: 1;
  display: flex;
  min-height: 0;
  overflow: hidden;
}

.calendar-panel {
  flex: 0 0 260px;
  padding: 16px;
  border-right: 1px solid var(--border-color);
  background: var(--bg-secondary);
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.panel-month {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.weekday-row {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 6px;
  color: var(--text-secondary);
  font-size: 12px;
  text-align: center;
}

.quick-days {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 6px;
}

.content-panel {
  flex: 1;
  min-width: 0;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
}

.quick-add,
.detail-fields {
  display: flex;
  gap: 8px;
}

.detail-fields {
  flex-wrap: wrap;
  flex-direction: column;
}

.field-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-group span {
  font-size: 12px;
  color: var(--text-secondary);
}

.time-range-group {
  width: 100%;
}

.time-range-fields {
  display: flex;
  align-items: center;
  gap: 8px;
}

.time-range-separator {
  font-size: 12px;
  color: var(--text-secondary);
}

.description-group textarea {
  min-height: 84px;
  resize: vertical;
}

.quick-input,
.todo-edit input,
.detail-fields input,
.detail-fields textarea {
  flex: 1;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 10px 12px;
  background: var(--bg-primary);
  color: var(--text-primary);
  outline: none;
}

.quick-input:focus,
.todo-edit input:focus,
.detail-fields input:focus,
.detail-fields textarea:focus {
  border-color: var(--primary-color);
}

.todo-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.todo-section h4 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}

.todo-meta,
.section-empty {
  color: var(--text-secondary);
  font-size: 12px;
}

.icon-btn,
.today-btn,
.quick-day,
.calendar-day,
.detail-btn,
.close-btn,
.submit-btn,
.collapse-btn {
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  z-index: 3;
  pointer-events: auto;
}

.icon-btn,
.today-btn,
.quick-day,
.calendar-day,
.detail-btn,
.close-btn,
.collapse-btn {
  padding: 8px 10px;
  background: var(--bg-primary);
  color: var(--text-primary);
}

.calendar-day {
  min-width: 0;
  padding: 8px 0;
}

.icon-btn:hover,
.today-btn:hover,
.quick-day:hover,
.calendar-day:hover,
.detail-btn:hover,
.collapse-btn:hover {
  background: var(--card-hover-bg);
}

.submit-btn {
  background: var(--primary-color);
  color: white;
  padding: 0 14px;
}

.secondary-btn {
  white-space: nowrap;
}

.form-message {
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(10, 132, 255, 0.12);
  color: var(--text-primary);
  font-size: 12px;
}

.form-message.error {
  background: rgba(255, 59, 48, 0.12);
  color: var(--danger-color);
}

.submit-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.submit-btn:not(:disabled):hover {
  background: var(--primary-hover);
}

.empty-state {
  min-height: 180px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  color: var(--text-secondary);
  text-align: center;
}

.empty-state p {
  margin: 0 0 8px;
  font-size: 16px;
  color: var(--text-primary);
}

.active {
  background: var(--primary-color);
  color: white;
}

.muted {
  opacity: 0.45;
}

.completed-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
