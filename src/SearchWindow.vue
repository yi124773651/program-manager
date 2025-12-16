<template>
  <div class="search-window">
    <!-- 搜索框 -->
    <div class="spotlight-input-wrapper" @mousedown="startDrag">
      <SearchIcon :size="20" class="search-icon" />
      <input
        ref="inputRef"
        v-model="query"
        type="text"
        class="spotlight-input"
        placeholder="搜索应用... (/ 网页, c: 剪贴板, = 计算器)"
        @input="handleSearch"
        @keydown="handleInputKeydown"
        @mousedown.stop
        autofocus
      />
      <div class="spotlight-hints">
        <kbd>ESC</kbd>
        <span>关闭</span>
      </div>
    </div>

    <!-- 搜索结果 -->
    <div v-if="hasResults" class="spotlight-results">
      <!-- 计算器结果 -->
      <div v-if="groupedResults.calculator.length > 0" class="result-group">
        <div class="group-label">
          <CalculatorIcon :size="14" />
          <span>计算结果</span>
        </div>
        <div
          v-for="(result, index) in groupedResults.calculator"
          :key="result.id"
          class="result-item calculator-result"
          :class="{ selected: getGlobalIndex('calculator', index) === selectedIndex }"
          @click="executeAndClose(result)"
          @mouseenter="selectIndex(getGlobalIndex('calculator', index))"
        >
          <div class="result-icon calculator">
            <CalculatorIcon :size="20" />
          </div>
          <div class="result-content">
            <div class="result-title calculator-value">{{ result.title }}</div>
            <div class="result-subtitle">{{ result.subtitle }}</div>
          </div>
          <div class="result-action">
            <CopyIcon :size="14" />
          </div>
        </div>
      </div>

      <!-- 应用结果 -->
      <div v-if="groupedResults.app.length > 0" class="result-group">
        <div class="group-label">
          <AppWindowIcon :size="14" />
          <span>应用</span>
        </div>
        <div
          v-for="(result, index) in groupedResults.app"
          :key="result.id"
          class="result-item"
          :class="{ selected: getGlobalIndex('app', index) === selectedIndex }"
          @click="executeAndClose(result)"
          @mouseenter="selectIndex(getGlobalIndex('app', index))"
        >
          <div class="result-icon">
            <img v-if="result.icon" :src="result.icon" alt="" />
            <AppWindowIcon v-else :size="24" />
          </div>
          <div class="result-content">
            <div class="result-title">{{ result.title }}</div>
            <div class="result-subtitle">{{ result.subtitle }}</div>
          </div>
          <div class="result-action">
            <CornerDownLeftIcon :size="14" />
          </div>
        </div>
      </div>

      <!-- 剪贴板结果 -->
      <div v-if="groupedResults.clipboard.length > 0" class="result-group">
        <div class="group-label">
          <ClipboardIcon :size="14" />
          <span>剪贴板</span>
        </div>
        <div
          v-for="(result, index) in groupedResults.clipboard"
          :key="result.id"
          class="result-item"
          :class="{ selected: getGlobalIndex('clipboard', index) === selectedIndex }"
          @click="executeAndClose(result)"
          @mouseenter="selectIndex(getGlobalIndex('clipboard', index))"
        >
          <div class="result-icon clipboard">
            <ClipboardIcon :size="20" />
          </div>
          <div class="result-content">
            <div class="result-title">{{ result.title }}</div>
            <div class="result-subtitle">{{ result.subtitle }}</div>
          </div>
          <div class="result-action">
            <CornerDownLeftIcon :size="14" />
          </div>
        </div>
      </div>

      <!-- 网页搜索 -->
      <div v-if="groupedResults.web.length > 0" class="result-group">
        <div class="group-label">
          <GlobeIcon :size="14" />
          <span>网页搜索</span>
        </div>
        <div
          v-for="(result, index) in groupedResults.web"
          :key="result.id"
          class="result-item"
          :class="{ selected: getGlobalIndex('web', index) === selectedIndex }"
          @click="executeAndClose(result)"
          @mouseenter="selectIndex(getGlobalIndex('web', index))"
        >
          <div class="result-icon web">
            <GlobeIcon :size="20" />
          </div>
          <div class="result-content">
            <div class="result-title">{{ result.title }}</div>
            <div class="result-subtitle">"{{ result.subtitle }}"</div>
          </div>
          <div class="result-action">
            <ExternalLinkIcon :size="14" />
          </div>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else-if="query && !isLoading" class="spotlight-empty">
      <SearchXIcon :size="32" />
      <p>没有找到匹配的结果</p>
      <p class="hint">尝试使用 / 搜索网页，或 c: 搜索剪贴板</p>
    </div>

    <!-- 加载状态 -->
    <div v-else-if="isLoading" class="spotlight-loading">
      <LoaderIcon :size="24" class="spinning" />
      <p>搜索中...</p>
    </div>

    <!-- 默认提示 -->
    <div v-else class="spotlight-tips">
      <div class="tip-item">
        <kbd>=</kbd>
        <span>计算器</span>
      </div>
      <div class="tip-item">
        <kbd>/</kbd>
        <span>网页搜索</span>
      </div>
      <div class="tip-item">
        <kbd>c:</kbd>
        <span>剪贴板</span>
      </div>
      <div class="tip-item">
        <kbd>↑↓</kbd>
        <span>选择</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useSearchStore } from '@/stores/searchStore'
import { useAppStore } from '@/stores/appStore'
import { storeToRefs } from 'pinia'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { LogicalSize } from '@tauri-apps/api/dpi'
import {
  SearchIcon,
  AppWindowIcon,
  ClipboardIcon,
  GlobeIcon,
  CornerDownLeftIcon,
  ExternalLinkIcon,
  SearchXIcon,
  LoaderIcon,
  CalculatorIcon,
  CopyIcon
} from 'lucide-vue-next'
import type { SearchResult, SearchResultType } from '@/types/search'

const appStore = useAppStore()
const searchStore = useSearchStore()
const { query, results, selectedIndex, isLoading } = storeToRefs(searchStore)
const { debouncedSearch, selectNext, selectPrev, selectIndex, executeResult } = searchStore

const inputRef = ref<HTMLInputElement | null>(null)

const hasResults = computed(() => results.value.length > 0)

const groupedResults = computed(() => {
  const groups: Record<SearchResultType, SearchResult[]> = {
    calculator: [],
    app: [],
    clipboard: [],
    web: []
  }
  for (const result of results.value) {
    groups[result.type].push(result)
  }
  return groups
})

// 计算结果在扁平列表中的全局索引
const getGlobalIndex = (type: SearchResultType, localIndex: number): number => {
  let offset = 0
  const order: SearchResultType[] = ['calculator', 'app', 'clipboard', 'web']

  for (const t of order) {
    if (t === type) {
      return offset + localIndex
    }
    offset += groupedResults.value[t].length
  }
  return 0
}

const handleSearch = () => {
  debouncedSearch(query.value)
}

const closeWindow = async () => {
  const win = getCurrentWindow()
  await win.close()
}

// 开始拖动窗口
let isDragging = false
const startDrag = async () => {
  isDragging = true
  const win = getCurrentWindow()
  await win.startDragging()
  // 拖动结束后重置标志
  setTimeout(() => {
    isDragging = false
  }, 100)
}

// 动态调整窗口高度
const updateWindowHeight = async () => {
  const win = getCurrentWindow()
  const baseHeight = 68 // 搜索框高度
  const tipsHeight = 52 // 提示栏高度
  const resultItemHeight = 60 // 每个结果项高度
  const groupLabelHeight = 32 // 分组标签高度
  const maxHeight = 500

  let height = baseHeight

  if (results.value.length > 0) {
    // 计算结果区域高度
    const groups = groupedResults.value
    let groupCount = 0
    if (groups.calculator.length > 0) groupCount++
    if (groups.app.length > 0) groupCount++
    if (groups.clipboard.length > 0) groupCount++
    if (groups.web.length > 0) groupCount++

    height += groupCount * groupLabelHeight
    height += Math.min(results.value.length, 6) * resultItemHeight
    height += 16 // padding
  } else if (!query.value) {
    // 显示提示
    height += tipsHeight
  } else {
    // 空状态
    height += 120
  }

  height = Math.min(height, maxHeight)

  try {
    await win.setSize(new LogicalSize(600, height))
  } catch (e) {
    console.error('调整窗口大小失败:', e)
  }
}

// 监听搜索结果变化，动态调整窗口高度
watch([results, query], () => {
  updateWindowHeight()
}, { immediate: true })

const executeAndClose = async (result: SearchResult) => {
  await executeResult(result)
  await closeWindow()
}

const handleInputKeydown = (event: KeyboardEvent) => {
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      selectNext()
      break
    case 'ArrowUp':
      event.preventDefault()
      selectPrev()
      break
    case 'Enter':
      event.preventDefault()
      if (results.value.length > 0) {
        const selected = results.value[selectedIndex.value]
        if (selected) {
          executeAndClose(selected)
        }
      }
      break
    case 'Escape':
      event.preventDefault()
      closeWindow()
      break
  }
}

// 初始化
onMounted(async () => {
  // 初始化 appStore 以获取应用列表
  await appStore.init()

  // 聚焦输入框
  inputRef.value?.focus()

  // 监听窗口失去焦点时关闭（但拖动时不关闭）
  const win = getCurrentWindow()
  win.onFocusChanged(({ payload: focused }) => {
    if (!focused && !isDragging) {
      closeWindow()
    }
  })
})
</script>

<style scoped>
.search-window {
  width: 100%;
  height: 100%;
  background: rgba(255, 255, 255, 0.45);
  backdrop-filter: blur(30px) saturate(200%);
  -webkit-backdrop-filter: blur(30px) saturate(200%);
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 16px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

@media (prefers-color-scheme: dark) {
  .search-window {
    background: rgba(30, 30, 30, 0.45);
    border: 1px solid rgba(255, 255, 255, 0.15);
  }
}

.spotlight-input-wrapper {
  display: flex;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
  gap: 12px;
  cursor: move;
}

.search-icon {
  color: var(--text-secondary);
  flex-shrink: 0;
  pointer-events: none;
}

.spotlight-input {
  flex: 1;
  background: transparent;
  border: none;
  font-size: 18px;
  color: var(--text-primary);
  outline: none;
  cursor: text;
}

.spotlight-input::placeholder {
  color: var(--text-secondary);
  font-size: 14px;
}

.spotlight-hints {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-secondary);
  font-size: 12px;
  pointer-events: none;
}

.spotlight-hints kbd {
  background: var(--bg-secondary);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-family: inherit;
}

.spotlight-results {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.result-group {
  margin-bottom: 8px;
}

.result-group:last-child {
  margin-bottom: 0;
}

.group-label {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.result-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
}

.result-item:hover,
.result-item.selected {
  background: var(--primary-color);
}

.result-item.selected .result-title,
.result-item.selected .result-subtitle,
.result-item.selected .result-action {
  color: white;
}

.result-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: var(--bg-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
  color: var(--text-secondary);
}

.result-icon img {
  width: 28px;
  height: 28px;
  object-fit: contain;
}

.result-icon.clipboard {
  background: rgba(52, 199, 89, 0.15);
  color: #34c759;
}

.result-icon.web {
  background: rgba(0, 122, 255, 0.15);
  color: #007aff;
}

.result-icon.calculator {
  background: rgba(255, 149, 0, 0.15);
  color: #ff9500;
}

.calculator-value {
  font-size: 24px !important;
  font-weight: 600 !important;
  font-family: 'SF Mono', 'Menlo', monospace;
}

.calculator-result.selected .calculator-value {
  color: white;
}

.result-content {
  flex: 1;
  min-width: 0;
}

.result-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.result-subtitle {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 2px;
}

.result-action {
  color: var(--text-secondary);
  flex-shrink: 0;
}

.spotlight-empty,
.spotlight-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  color: var(--text-secondary);
  gap: 8px;
}

.spotlight-empty p,
.spotlight-loading p {
  margin: 0;
  font-size: 14px;
}

.spotlight-empty .hint {
  font-size: 12px;
  opacity: 0.7;
}

.spotlight-tips {
  display: flex;
  justify-content: center;
  gap: 24px;
  padding: 16px 20px;
  border-top: 1px solid var(--border-color);
}

.tip-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}

.tip-item kbd {
  background: var(--bg-secondary);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-family: inherit;
  min-width: 20px;
  text-align: center;
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
