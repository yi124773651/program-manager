<template>
  <div class="notes-window">
    <!-- 便签头部 - 可拖动 -->
    <div class="notes-header" @mousedown="startDrag">
      <h3>快捷便签</h3>
      <div class="header-actions" @mousedown.stop>
        <button class="icon-btn" @click="addNote" title="新建便签">
          <PlusIcon :size="18" />
        </button>
        <button class="icon-btn" @click="closeWindow" title="关闭">
          <XIcon :size="18" />
        </button>
      </div>
    </div>

    <div class="notes-body">
      <!-- 便签列表 -->
      <div class="notes-list">
        <div
          v-for="note in sortedNotes"
          :key="note.id"
          class="note-item"
          :class="{ active: note.id === activeNoteId }"
          :style="{ borderLeftColor: note.color }"
          @click="selectNote(note.id)"
        >
          <div class="note-preview">
            {{ note.content.slice(0, 50) || '空便签' }}
          </div>
          <div class="note-meta">
            {{ formatTime(note.updatedAt) }}
          </div>
        </div>

        <div v-if="sortedNotes.length === 0" class="empty-notes">
          <StickyNoteIcon :size="32" />
          <p>暂无便签</p>
          <button class="add-btn" @click="addNote">新建便签</button>
        </div>
      </div>

      <!-- 便签编辑区 -->
      <div class="note-editor" v-if="activeNote">
        <div class="editor-toolbar">
          <div class="color-picker">
            <button
              v-for="color in noteColors"
              :key="color"
              class="color-btn"
              :class="{ active: activeNote.color === color }"
              :style="{ background: color }"
              @click="changeColor(activeNote.id, color)"
            />
          </div>
          <button
            class="icon-btn danger"
            @click="confirmDelete"
            title="删除便签"
          >
            <TrashIcon :size="16" />
          </button>
        </div>
        <textarea
          ref="textareaRef"
          v-model="activeNote.content"
          class="note-textarea"
          :style="{ background: activeNote.color }"
          placeholder="在这里记录..."
          @input="handleInput"
        />
      </div>

      <div v-else class="no-note-selected">
        <StickyNoteIcon :size="48" />
        <p>选择或新建一个便签</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick, watch } from 'vue'
import { useNotesStore, NOTE_COLORS } from '@/stores/notesStore'
import { storeToRefs } from 'pinia'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { ask } from '@tauri-apps/plugin-dialog'
import {
  PlusIcon,
  XIcon,
  TrashIcon,
  StickyNoteIcon
} from 'lucide-vue-next'

const notesStore = useNotesStore()
const { activeNoteId, activeNote, sortedNotes } = storeToRefs(notesStore)
const { addNote, selectNote, updateNote, deleteNote, changeColor } = notesStore

const textareaRef = ref<HTMLTextAreaElement | null>(null)
const noteColors = NOTE_COLORS

const handleInput = (event: Event) => {
  const target = event.target as HTMLTextAreaElement
  if (activeNoteId.value) {
    updateNote(activeNoteId.value, target.value)
  }
}

const confirmDelete = async () => {
  if (!activeNoteId.value) return

  const confirmed = await ask('确定要删除这个便签吗？', {
    title: '删除确认',
    kind: 'warning'
  })

  if (confirmed) {
    deleteNote(activeNoteId.value)
  }
}

const formatTime = (timestamp: number) => {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  return date.toLocaleDateString()
}

const closeWindow = async () => {
  const win = getCurrentWindow()
  await win.close()
}

// 开始拖动窗口
const startDrag = async () => {
  const win = getCurrentWindow()
  await win.startDragging()
}

// 监听 activeNote 变化，聚焦文本框
watch(activeNote, async (note) => {
  if (note) {
    await nextTick()
    textareaRef.value?.focus()
  }
})

// ESC 关闭窗口
const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    closeWindow()
  }
}

// 初始化
onMounted(async () => {
  // 初始化便签 store
  notesStore.init()

  // 如果没有便签，创建一个
  if (sortedNotes.value.length === 0) {
    addNote()
  }

  // 聚焦文本框
  await nextTick()
  textareaRef.value?.focus()

  // 监听 ESC 键
  document.addEventListener('keydown', handleKeydown)
})
</script>

<style scoped>
.notes-window {
  width: 100%;
  height: 100%;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: var(--shadow-xl);
}

@media (prefers-color-scheme: dark) {
  .notes-window {
    background: rgba(30, 30, 30, 0.85);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }
}

.notes-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
  cursor: move;
}

.notes-header h3 {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
  color: var(--text-primary);
}

.header-actions {
  display: flex;
  gap: 8px;
}

.icon-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
}

.icon-btn:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.icon-btn.danger:hover {
  background: rgba(255, 59, 48, 0.1);
  color: var(--danger-color);
}

.notes-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.notes-list {
  width: 200px;
  border-right: 1px solid var(--border-color);
  overflow-y: auto;
  background: var(--bg-secondary);
}

.note-item {
  padding: 12px 16px;
  border-left: 3px solid transparent;
  cursor: pointer;
  transition: all 0.2s;
}

.note-item:hover {
  background: var(--card-hover-bg);
}

.note-item.active {
  background: var(--category-active);
}

.note-preview {
  font-size: 13px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 4px;
}

.note-meta {
  font-size: 11px;
  color: var(--text-secondary);
}

.empty-notes {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  color: var(--text-secondary);
  gap: 8px;
}

.empty-notes p {
  font-size: 13px;
  margin: 0;
}

.add-btn {
  margin-top: 8px;
  padding: 6px 12px;
  background: var(--primary-color);
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.add-btn:hover {
  background: var(--primary-hover);
}

.note-editor {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.no-note-selected {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  gap: 12px;
}

.no-note-selected p {
  margin: 0;
  font-size: 14px;
}

.editor-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
}

.color-picker {
  display: flex;
  gap: 8px;
}

.color-btn {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.2s;
}

.color-btn:hover {
  transform: scale(1.1);
}

.color-btn.active {
  border-color: var(--text-primary);
  box-shadow: 0 0 0 2px var(--bg-primary);
}

.note-textarea {
  flex: 1;
  padding: 16px;
  border: none;
  resize: none;
  font-size: 14px;
  line-height: 1.6;
  color: #333;
  outline: none;
  font-family: inherit;
}

.note-textarea::placeholder {
  color: rgba(0, 0, 0, 0.4);
}
</style>
