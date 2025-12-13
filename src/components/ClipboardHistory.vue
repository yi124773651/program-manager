<template>
  <div class="clipboard-panel">
    <div class="clipboard-header">
      <h3>剪贴板历史</h3>
      <div class="clipboard-actions">
        <button
          class="icon-btn"
          @click="toggleMonitoring"
          :title="isMonitoring ? '暂停监控' : '开始监控'"
        >
          <PauseIcon v-if="isMonitoring" :size="16" />
          <PlayIcon v-else :size="16" />
        </button>
        <button
          class="icon-btn danger"
          @click="clearHistory"
          title="清除历史"
        >
          <TrashIcon :size="16" />
        </button>
      </div>
    </div>

    <div class="clipboard-search">
      <SearchIcon :size="16" />
      <input
        v-model="searchQuery"
        type="text"
        placeholder="搜索剪贴板历史..."
        @input="handleSearch"
      />
    </div>

    <div class="clipboard-list">
      <!-- 置顶项 -->
      <div v-if="pinnedItems.length > 0" class="pinned-section">
        <div class="section-label">
          <PinIcon :size="12" />
          <span>已置顶</span>
        </div>
        <div
          v-for="item in pinnedItems"
          :key="item.id"
          class="clipboard-item pinned"
          @click="pasteItem(item.id)"
        >
          <div class="item-content">
            {{ item.preview || item.content }}
          </div>
          <div class="item-actions">
            <button
              class="icon-btn small"
              @click.stop="togglePin(item.id)"
              title="取消置顶"
            >
              <PinOffIcon :size="14" />
            </button>
            <button
              class="icon-btn small danger"
              @click.stop="deleteItem(item.id)"
              title="删除"
            >
              <XIcon :size="14" />
            </button>
          </div>
        </div>
      </div>

      <!-- 普通项 -->
      <div
        v-for="item in filteredItems.filter(i => !i.pinned)"
        :key="item.id"
        class="clipboard-item"
        @click="pasteItem(item.id)"
      >
        <div class="item-content">
          {{ item.preview || item.content }}
        </div>
        <div class="item-meta">
          <span class="item-time">{{ formatTime(item.createdAt) }}</span>
          <div class="item-actions">
            <button
              class="icon-btn small"
              @click.stop="togglePin(item.id)"
              title="置顶"
            >
              <PinIcon :size="14" />
            </button>
            <button
              class="icon-btn small danger"
              @click.stop="deleteItem(item.id)"
              title="删除"
            >
              <XIcon :size="14" />
            </button>
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-if="filteredItems.length === 0" class="empty-state">
        <ClipboardIcon :size="48" />
        <p>{{ searchQuery ? '没有找到匹配的记录' : '暂无剪贴板历史' }}</p>
        <p v-if="!searchQuery" class="empty-hint">复制的内容会自动记录在这里</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useClipboardStore } from '@/stores/clipboardStore'
import {
  SearchIcon,
  TrashIcon,
  PinIcon,
  PinOffIcon,
  XIcon,
  ClipboardIcon,
  PauseIcon,
  PlayIcon
} from 'lucide-vue-next'

const clipboardStore = useClipboardStore()
const searchQuery = ref('')

const filteredItems = computed(() => clipboardStore.filteredItems)
const pinnedItems = computed(() => clipboardStore.pinnedItems)
const isMonitoring = computed(() => clipboardStore.isMonitoring)

const handleSearch = () => {
  clipboardStore.setSearchQuery(searchQuery.value)
}

const pasteItem = (id: string) => {
  clipboardStore.pasteItem(id)
}

const togglePin = (id: string) => {
  clipboardStore.togglePin(id)
}

const deleteItem = (id: string) => {
  clipboardStore.deleteItem(id)
}

const clearHistory = () => {
  if (confirm('确定要清除剪贴板历史吗？置顶项将被保留。')) {
    clipboardStore.clearHistory()
  }
}

const toggleMonitoring = () => {
  clipboardStore.toggleMonitoring()
}

const formatTime = (timestamp: number) => {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  if (diff < 604800000) return `${Math.floor(diff / 86400000)} 天前`
  return date.toLocaleDateString()
}

onMounted(() => {
  clipboardStore.init()
})

onUnmounted(() => {
  clipboardStore.stopMonitoring()
})
</script>

<style scoped>
.clipboard-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-primary);
}

.clipboard-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid var(--border-color);
}

.clipboard-header h3 {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
}

.clipboard-actions {
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

.icon-btn.small {
  width: 24px;
  height: 24px;
  border-radius: 6px;
}

.clipboard-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
}

.clipboard-search input {
  flex: 1;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font-size: 14px;
}

.clipboard-search input::placeholder {
  color: var(--text-secondary);
}

.clipboard-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.pinned-section {
  margin-bottom: 16px;
}

.section-label {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
}

.clipboard-item {
  padding: 12px;
  margin-bottom: 8px;
  background: var(--bg-secondary);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.clipboard-item:hover {
  background: var(--card-hover-bg);
}

.clipboard-item.pinned {
  border-left: 3px solid var(--primary-color);
}

.item-content {
  font-size: 14px;
  line-height: 1.5;
  color: var(--text-primary);
  word-break: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.item-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
}

.item-time {
  font-size: 12px;
  color: var(--text-secondary);
}

.item-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s;
}

.clipboard-item:hover .item-actions {
  opacity: 1;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  color: var(--text-secondary);
  gap: 12px;
}

.empty-state p {
  font-size: 14px;
  margin: 0;
}

.empty-hint {
  font-size: 12px !important;
  opacity: 0.7;
}
</style>
