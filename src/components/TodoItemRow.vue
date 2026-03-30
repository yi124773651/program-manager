<template>
  <article class="todo-row">
    <label class="toggle-wrap">
      <input type="checkbox" :checked="item.completed" @change="$emit('toggle')" />
    </label>

    <div v-if="!editing" class="todo-main" @dblclick="editing = true">
      <div class="todo-title">{{ item.title }}</div>
      <div class="todo-meta">{{ timeLabel }} · {{ item.date }}</div>
      <div v-if="item.description" class="todo-description">{{ item.description }}</div>
    </div>

    <div v-else class="todo-edit">
      <input v-model="draft.title" type="text" />
      <div class="todo-edit-row">
        <input v-model="draft.date" type="date" />
        <input v-model="draft.startTime" type="time" step="900" />
        <span class="time-divider">至</span>
        <input v-model="draft.endTime" type="time" step="900" />
      </div>
      <textarea v-model="draft.description" rows="2" maxlength="200" placeholder="补充任务说明" />
    </div>

    <div class="todo-actions">
      <button class="link-btn" type="button" @click="editing ? save() : (editing = true)">
        {{ editing ? '保存' : '编辑' }}
      </button>
      <button class="link-btn danger" type="button" @click="$emit('remove')">删除</button>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { TodoInput, TodoItem } from '@/types/todo'

const props = defineProps<{
  item: TodoItem
}>()

const emit = defineEmits<{
  toggle: []
  remove: []
  save: [payload: Partial<TodoInput>]
}>()
const editing = ref(false)
const timeLabel = computed(() => {
  if (props.item.startTime && props.item.endTime) {
    return `${props.item.startTime} - ${props.item.endTime}`
  }

  if (props.item.startTime) {
    return `${props.item.startTime} 开始`
  }

  if (props.item.endTime) {
    return `${props.item.endTime} 截止`
  }

  return '无时间'
})

const draft = reactive({
  title: props.item.title,
  date: props.item.date,
  startTime: props.item.startTime ?? '',
  endTime: props.item.endTime ?? '',
  description: props.item.description ?? ''
})

watch(() => props.item, (item) => {
  draft.title = item.title
  draft.date = item.date
  draft.startTime = item.startTime ?? ''
  draft.endTime = item.endTime ?? ''
  draft.description = item.description ?? ''
}, { deep: true })

const save = () => {
  editing.value = false
  emit('save', {
    title: draft.title,
    date: draft.date,
    startTime: draft.startTime || undefined,
    endTime: draft.endTime || undefined,
    description: draft.description
  })
}
</script>

<style scoped>
.todo-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-primary);
}

.toggle-wrap {
  display: flex;
  align-items: center;
}

.toggle-wrap input {
  width: 16px;
  height: 16px;
}

.todo-main,
.todo-edit {
  flex: 1;
  min-width: 0;
}

.todo-edit {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.todo-edit-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.todo-edit input,
.todo-edit textarea {
  flex: 1;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 10px 12px;
  background: var(--bg-primary);
  color: var(--text-primary);
  outline: none;
}

.todo-edit textarea {
  resize: vertical;
  min-height: 64px;
}

.todo-edit input:focus,
.todo-edit textarea:focus {
  border-color: var(--primary-color);
}

.todo-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.todo-meta {
  color: var(--text-secondary);
  font-size: 12px;
}

.todo-description {
  margin-top: 6px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-secondary);
  white-space: pre-wrap;
}

.time-divider {
  color: var(--text-secondary);
  font-size: 12px;
}

.todo-actions {
  display: flex;
  gap: 8px;
}

.link-btn {
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  padding: 8px 10px;
  background: var(--bg-primary);
  color: var(--text-primary);
}

.link-btn:hover {
  background: var(--card-hover-bg);
}

.danger {
  color: var(--danger-color);
}
</style>
