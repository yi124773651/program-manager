<template>
  <Teleport to="body">
    <Transition name="spotlight">
      <div v-if="isOpen" class="spotlight-overlay" @click.self="close">
        <div class="spotlight-container">
          <!-- 搜索框 -->
          <div class="spotlight-input-wrapper">
            <SearchIcon :size="20" class="search-icon" />
            <input
              ref="inputRef"
              v-model="query"
              type="text"
              class="spotlight-input"
              placeholder="搜索应用、剪贴板... (/ 网页, c: 剪贴板)"
              @input="handleSearch"
              @keydown="handleKeydown"
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
                @click="executeResult(result)"
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
                @click="executeResult(result)"
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
                @click="executeResult(result)"
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
                @click="executeResult(result)"
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
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useSearchStore } from '@/stores/searchStore'
import { storeToRefs } from 'pinia'
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

const searchStore = useSearchStore()
const { isOpen, query, results, selectedIndex, isLoading } = storeToRefs(searchStore)
const { close, search, selectNext, selectPrev, selectIndex, executeSelected, executeResult } = searchStore

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
  search(query.value)
}

const handleKeydown = (event: KeyboardEvent) => {
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
      executeSelected()
      break
    case 'Escape':
      event.preventDefault()
      close()
      break
  }
}

// 打开时聚焦输入框
watch(isOpen, async (open) => {
  if (open) {
    await nextTick()
    inputRef.value?.focus()
  }
})
</script>

<style scoped>
.spotlight-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 15vh;
  z-index: 9999;
}

.spotlight-container {
  width: 600px;
  max-width: 90vw;
  background: var(--glass-bg);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--glass-border);
  border-radius: 16px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}

.spotlight-input-wrapper {
  display: flex;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
  gap: 12px;
}

.search-icon {
  color: var(--text-secondary);
  flex-shrink: 0;
}

.spotlight-input {
  flex: 1;
  background: transparent;
  border: none;
  font-size: 18px;
  color: var(--text-primary);
  outline: none;
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
}

.spotlight-hints kbd {
  background: var(--bg-secondary);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-family: inherit;
}

.spotlight-results {
  max-height: 400px;
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

/* 动画 */
.spotlight-enter-active,
.spotlight-leave-active {
  transition: all 0.2s ease;
}

.spotlight-enter-from,
.spotlight-leave-to {
  opacity: 0;
}

.spotlight-enter-from .spotlight-container,
.spotlight-leave-to .spotlight-container {
  transform: scale(0.95) translateY(-20px);
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
