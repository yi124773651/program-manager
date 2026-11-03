<template>
  <span class="end-time-input">
    <input
      type="time"
      step="900"
      :value="isMidnight ? '00:00' : modelValue"
      :aria-label="label"
      :disabled="disabled || isMidnight"
      :required="required && !isMidnight"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
    <button
      type="button"
      :disabled="disabled"
      :aria-pressed="isMidnight"
      :aria-label="`${label}：${isMidnight ? '取消' : '设为'}当天 24:00`"
      :class="{ selected: isMidnight }"
      title="以当天 24:00 结束"
      @click="emit('update:modelValue', isMidnight ? previousTime : '24:00')"
    >至 24:00</button>
  </span>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  modelValue?: string
  label?: string
  disabled?: boolean
  required?: boolean
}>(), { label: '结束时间' })
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const isMidnight = computed(() => props.modelValue === '24:00')
const previousTime = ref('')

// 原生时间输入不接受 24:00，单独选择当天结束边界，避免浏览器清空已保存的值。
watch(() => props.modelValue, (value) => {
  if (value !== '24:00') previousTime.value = value ?? ''
}, { immediate: true })
</script>

<style scoped>
.end-time-input { display: flex; flex: 1; align-items: center; gap: 5px; min-width: 170px; }
input, button { font: inherit; color: var(--text-primary); background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 7px; padding: 7px 9px; }
input { flex: 1; min-width: 0; width: 0; }
button { flex-shrink: 0; cursor: pointer; white-space: nowrap; }
button.selected { color: var(--primary-color); border-color: var(--primary-color); }
input:disabled { opacity: .55; }
button:disabled { cursor: default; opacity: .55; }
button:focus-visible, input:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
</style>
