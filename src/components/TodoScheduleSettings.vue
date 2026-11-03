<template>
  <form class="schedule-settings" @submit.prevent="save">
    <strong>时间块日程</strong>
    <p>每天均可规划 00:00–24:00，以下工作日和工作时段仅用于时间轴背景提示。</p>
    <div class="days">
      <label v-for="day in days" :key="day.value">
        <input v-model="draft.workDays" type="checkbox" :value="day.value" />{{ day.label }}
      </label>
    </div>
    <label>工作时段 <input v-model="draft.workStart" aria-label="工作开始时间" type="time" step="900" /> 至
      <TodoEndTimeInput v-model="draft.workEnd" label="工作结束时间" required /></label>
    <label>拖拽吸附 <select v-model="draft.snapMinutes"><option :value="30">30 分钟</option><option :value="60">60 分钟</option></select></label>
    <label>午饭预设 <input v-model="draft.lunchStart" aria-label="午饭开始时间" type="time" step="900" /> 至
      <TodoEndTimeInput v-model="draft.lunchEnd" label="午饭结束时间" required /></label>
    <div><button :disabled="saving" type="submit">{{ saving ? '保存中…' : '保存日程设置' }}</button></div>
    <p v-if="message" role="status">{{ message }}</p>
  </form>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import TodoEndTimeInput from './TodoEndTimeInput.vue'
import { useAppStore } from '@/stores/appStore'
import { normalizeScheduleSettings, validateScheduleSettings } from '@/services/todoScheduleService'

const appStore = useAppStore()
const draft = ref(normalizeScheduleSettings())
const message = ref('')
const saving = ref(false)
const days = [1, 2, 3, 4, 5, 6, 0].map((value) => ({ value, label: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][value] }))
watch(() => appStore.settings.todoSchedule, (value) => {
  draft.value = JSON.parse(JSON.stringify(normalizeScheduleSettings(value)))
}, { immediate: true, deep: true })

async function save() {
  message.value = validateScheduleSettings(draft.value)
  if (message.value) return
  saving.value = true
  const previous = appStore.settings.todoSchedule
  try {
    await appStore.updateSettings({ todoSchedule: JSON.parse(JSON.stringify(draft.value)) }, { immediate: true })
    message.value = '日程设置已保存。'
  } catch (error) {
    appStore.config.settings.todoSchedule = previous
    message.value = `保存失败：${String(error)}`
  } finally { saving.value = false }
}
</script>

<style scoped>
.schedule-settings { display: grid; gap: 12px; padding: 16px; color: var(--text-primary); background: var(--bg-secondary); border-radius: 12px; }
.days { display: flex; flex-wrap: wrap; gap: 10px; }
label { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 13px; }
input, select, button { padding: 6px 8px; color: var(--text-primary); background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; }
button { cursor: pointer; } p { margin: 0; font-size: 13px; }
</style>
