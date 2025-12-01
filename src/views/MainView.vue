<template>
  <div class="main-view">
    <!-- 侧边栏 -->
    <CategoryList />

    <!-- 主内容区 -->
    <div
      class="content-area"
      :class="{ 'drag-over': isDragging }"
    >
      <!-- 拖拽提示层 -->
      <div v-if="isDragging" class="drop-overlay">
        <div class="drop-hint">
          <FolderIcon :size="64" />
          <p>拖放 .exe 或 .lnk 文件到此处添加</p>
        </div>
      </div>

      <!-- 工具栏 -->
      <div class="toolbar">
        <div class="toolbar-left">
          <h1>{{ currentCategoryName || '程序管理器' }}</h1>
          <span v-if="currentApps.length > 0" class="app-count">
            {{ currentApps.length }} 个应用
          </span>
        </div>

        <div class="toolbar-right">
          <!-- 搜索框 -->
          <div class="search-box">
            <SearchIcon :size="16" />
            <input
              v-model="searchQuery"
              type="text"
              placeholder="搜索应用..."
              @input="handleSearch"
            />
          </div>

          <!-- 添加按钮 -->
          <button class="btn-primary" @click="handleAddApp">
            <PlusIcon :size="16" />
            <span>添加应用</span>
          </button>

          <!-- 视图切换 -->
          <div class="view-switcher">
            <button
              v-for="size in (['small', 'medium', 'large'] as const)"
              :key="size"
              :class="{ active: cardSize === size }"
              @click="setCardSize(size)"
              :title="`${size === 'small' ? '小' : size === 'medium' ? '中' : '大'}卡片`"
            >
              <GridIcon :size="size === 'small' ? 14 : size === 'medium' ? 16 : 18" />
            </button>
          </div>
        </div>
      </div>

      <!-- 应用网格 -->
      <div ref="appsGridRef" class="apps-grid" :class="`size-${cardSize}`">
        <AppCard
          v-for="app in currentApps"
          :key="app.id"
          :app="app"
          :size="cardSize"
          :data-app-id="app.id"
          class="app-item"
        />

        <!-- 空状态 -->
        <div v-if="currentApps.length === 0" class="empty-state">
          <FolderIcon :size="64" />
          <p>{{ searchQuery ? '没有找到匹配的应用' : '暂无应用' }}</p>
          <p v-if="!searchQuery" class="empty-hint">拖放 .exe 或 .lnk 文件到此处，或点击下方按钮</p>
          <button v-if="!searchQuery" class="btn-secondary" @click="handleAddApp">
            <PlusIcon :size="16" />
            添加第一个应用
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useAppStore } from '@/stores/appStore'
import { SearchIcon, PlusIcon, GridIcon, FolderIcon } from 'lucide-vue-next'
import CategoryList from '@/components/CategoryList.vue'
import AppCard from '@/components/AppCard.vue'
import { open, message } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'
import { type UnlistenFn } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import Sortable from 'sortablejs'

// 使用 window 对象存储全局状态，防止模块热更新导致状态丢失
declare global {
  interface Window {
    __dragDropState?: {
      unlisten: UnlistenFn | null
      initialized: boolean
      isProcessing: boolean
      lastDropTime: number
      lastDropPathsKey: string
    }
  }
}

// 初始化全局状态
if (!window.__dragDropState) {
  window.__dragDropState = {
    unlisten: null,
    initialized: false,
    isProcessing: false,
    lastDropTime: 0,
    lastDropPathsKey: ''
  }
}

const dragDropState = window.__dragDropState

const appStore = useAppStore()

const searchQuery = ref('')
const appsGridRef = ref<HTMLElement | null>(null)
const sortableInstance = ref<any>(null)
const isDragging = ref(false)
const currentApps = computed(() => appStore.currentApps)
const cardSize = computed(() => appStore.settings.cardSize)
const currentCategoryName = computed(() => {
  if (!appStore.currentCategory) return null
  return appStore.config.categories[appStore.currentCategory]?.name
})

const handleSearch = () => {
  appStore.setSearchQuery(searchQuery.value)
}

const setCardSize = (size: 'small' | 'medium' | 'large') => {
  appStore.updateSettings({ cardSize: size })
}

// 处理 Tauri 文件拖拽
const handleTauriFileDrop = async (paths: string[]) => {
  if (!paths || paths.length === 0) {
    dragDropState.isProcessing = false
    return
  }

  console.log('处理拖拽文件:', paths)

  try {
    // 确保有分类
    let targetCategoryId = appStore.currentCategory
    if (!targetCategoryId) {
      const categories = appStore.categories
      if (categories.length === 0) {
        const defaultCategory = await appStore.addCategory('我的应用')
        targetCategoryId = defaultCategory.id
        await appStore.selectCategory(targetCategoryId)
      } else {
        targetCategoryId = categories[0].id
        await appStore.selectCategory(targetCategoryId)
      }
    }

    // 处理所有拖入的文件
    const results: { success: string[]; skipped: string[]; failed: string[] } = {
      success: [],
      skipped: [],
      failed: []
    }

    for (const filePath of paths) {
      if (!filePath) continue

      try {
        await processFile(filePath, targetCategoryId!, results)
      } catch (error) {
        console.error('处理文件失败:', filePath, error)
        const fileName = filePath.split('\\').pop() || filePath.split('/').pop() || filePath
        results.failed.push(fileName)
      }
    }

    // 显示结果
    await showAddResults(results)
  } catch (error) {
    console.error('拖拽处理错误:', error)
  } finally {
    // 延迟解锁
    setTimeout(() => {
      dragDropState.isProcessing = false
    }, 500)
  }
}

// 初始化 Tauri 拖拽事件监听
const initTauriDragDrop = async () => {
  // 使用全局标记防止重复注册
  if (dragDropState.initialized) {
    console.log('Tauri 拖拽事件监听已存在（全局），跳过初始化')
    return
  }

  try {
    // 先清理可能存在的旧监听器
    if (dragDropState.unlisten) {
      dragDropState.unlisten()
      dragDropState.unlisten = null
    }

    const currentWindow = getCurrentWindow()

    // 监听拖拽事件
    dragDropState.unlisten = await currentWindow.onDragDropEvent((event) => {
      if (event.payload.type === 'enter') {
        isDragging.value = true
      } else if (event.payload.type === 'leave') {
        isDragging.value = false
      } else if (event.payload.type === 'drop') {
        // drop 时立即关闭拖拽状态
        isDragging.value = false

        const paths = event.payload.paths
        const now = Date.now()
        const pathsKey = paths.join('|')

        // 在同步代码中立即检查和设置锁
        if (dragDropState.isProcessing) {
          console.log('跳过：正在处理中')
          return
        }

        if (pathsKey === dragDropState.lastDropPathsKey && now - dragDropState.lastDropTime < 2000) {
          console.log('跳过：时间去重')
          return
        }

        // 立即设置锁
        dragDropState.isProcessing = true
        dragDropState.lastDropTime = now
        dragDropState.lastDropPathsKey = pathsKey

        handleTauriFileDrop(paths)
      }
    })

    dragDropState.initialized = true
    console.log('Tauri 拖拽事件监听已初始化')
  } catch (error) {
    console.error('初始化 Tauri 拖拽事件监听失败:', error)
  }
}

// 处理单个文件
const processFile = async (
  filePath: string,
  categoryId: string,
  results: { success: string[]; skipped: string[]; failed: string[] }
) => {
  const lowerPath = filePath.toLowerCase()

  // 获取实际的执行路径
  let execPath = filePath
  let appName = ''

  if (lowerPath.endsWith('.lnk')) {
    // 解析快捷方式
    try {
      execPath = await invoke<string>('resolve_shortcut', { lnkPath: filePath })
      // 从快捷方式文件名获取应用名
      const lnkName = filePath.split('\\').pop() || filePath.split('/').pop() || ''
      appName = lnkName.replace(/\.lnk$/i, '')
    } catch (error) {
      console.error('解析快捷方式失败:', error)
      results.failed.push(filePath.split('\\').pop() || filePath)
      return
    }
  } else if (lowerPath.endsWith('.exe')) {
    // 直接使用 exe 文件
    const fileName = filePath.split('\\').pop() || filePath.split('/').pop() || ''
    appName = fileName.replace(/\.exe$/i, '')
  } else {
    // 不支持的文件类型，静默跳过
    return
  }

  // 检查是否已存在
  if (appStore.isAppExists(execPath)) {
    results.skipped.push(appName)
    return
  }

  // 添加应用
  await appStore.addApp({
    name: appName,
    path: execPath,
    category: categoryId
  })
  results.success.push(appName)
}

// 显示添加结果
const showAddResults = async (results: { success: string[]; skipped: string[]; failed: string[] }) => {
  const messages: string[] = []

  if (results.success.length > 0) {
    messages.push(`成功添加 ${results.success.length} 个应用`)
  }
  if (results.skipped.length > 0) {
    messages.push(`跳过 ${results.skipped.length} 个已存在的应用`)
  }
  if (results.failed.length > 0) {
    messages.push(`${results.failed.length} 个文件处理失败`)
  }

  if (messages.length > 0) {
    // 先确保窗口在前台再显示对话框
    const currentWindow = getCurrentWindow()
    await currentWindow.setFocus()

    // 使用 Tauri 的 message dialog
    await message(messages.join('\n'), {
      title: '添加结果',
      kind: results.failed.length > 0 ? 'warning' : 'info'
    })

    // 对话框关闭后，再次确保窗口在前台
    await new Promise(resolve => setTimeout(resolve, 50))
    await currentWindow.setAlwaysOnTop(true)
    await currentWindow.setFocus()
    await currentWindow.setAlwaysOnTop(false)
  }
}

// 初始化 Sortable.js
const initSortable = () => {
  if (!appsGridRef.value) return

  // 销毁之前的实例
  if (sortableInstance.value) {
    sortableInstance.value.destroy()
    sortableInstance.value = null
  }

  // 创建新实例
  sortableInstance.value = Sortable.create(appsGridRef.value, {
    animation: 250,
    forceFallback: true,
    fallbackOnBody: true,
    fallbackTolerance: 3,
    swapThreshold: 0.65,
    group: {
      name: 'apps',
      pull: true,
      put: true
    },
    ghostClass: 'sortable-ghost',
    chosenClass: 'sortable-chosen',
    dragClass: 'sortable-drag',
    fallbackClass: 'sortable-fallback',
    delay: 50,
    filter: '.empty-state',
    onEnd: (evt) => {
      // 如果是在同一个容器内拖拽（应用排序）
      if (evt.from === evt.to) {
        const oldIndex = evt.oldIndex
        const newIndex = evt.newIndex

        if (oldIndex !== undefined && newIndex !== undefined && oldIndex !== newIndex) {
          appStore.reorderApps(oldIndex, newIndex)
        }
      }
    }
  })
}

// 监听应用列表变化，重新初始化 Sortable
watch(() => appStore.currentCategory, async () => {
  await nextTick()
  initSortable()
}, { immediate: false })

onMounted(async () => {
  await nextTick()
  initSortable()
  // 初始化 Tauri 文件拖拽事件
  initTauriDragDrop()
})

onUnmounted(() => {
  // 注意：不清理全局拖拽监听器，因为它是全局的，组件销毁后仍需保持
  // 销毁 Sortable 实例
  if (sortableInstance.value) {
    sortableInstance.value.destroy()
    sortableInstance.value = null
  }
})

const handleAddApp = async () => {
  if (!appStore.currentCategory) {
    alert('请先选择或创建一个分类')
    return
  }

  try {
    const file = await open({
      multiple: true,
      filters: [{
        name: '可执行文件',
        extensions: ['exe', 'lnk']
      }]
    })

    console.log('选择的文件:', file)

    if (file) {
      const files = Array.isArray(file) ? file : [file]
      const results: { success: string[]; skipped: string[]; failed: string[] } = {
        success: [],
        skipped: [],
        failed: []
      }

      for (const f of files) {
        const filePath = typeof f === 'string' ? f : (f as any).path
        if (!filePath) continue

        try {
          await processFile(filePath, appStore.currentCategory!, results)
        } catch (error) {
          console.error('处理文件失败:', filePath, error)
          const fileName = filePath.split('\\').pop() || filePath.split('/').pop() || filePath
          results.failed.push(fileName)
        }
      }

      showAddResults(results)
    }
  } catch (error) {
    console.error('添加应用失败:', error)
    alert(`添加应用失败: ${error}`)
  }
}
</script>

<style scoped>
.main-view {
  display: flex;
  height: 100vh;
  background: transparent;
}

.content-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

.content-area.drag-over {
  background: rgba(59, 130, 246, 0.05);
}

.drop-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(59, 130, 246, 0.1);
  border: 3px dashed var(--primary-color);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  pointer-events: none;
  margin: 16px;
}

.drop-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  color: var(--primary-color);
}

.drop-hint p {
  font-size: 18px;
  font-weight: 500;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-bottom: 1px solid var(--border-color);
  background: var(--toolbar-bg-transparent);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  min-height: 70px;
}

.toolbar-left {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.toolbar-left h1 {
  font-size: 24px;
  font-weight: 600;
  margin: 0;
}

.app-count {
  font-size: 14px;
  color: var(--text-secondary);
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg-secondary);
  border-radius: 8px;
  border: 1px solid var(--border-color);
  min-width: 240px;
}

.search-box input {
  flex: 1;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font-size: 14px;
}

.search-box input::placeholder {
  color: var(--text-secondary);
}

.btn-primary {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: var(--btn-primary);
  color: white;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.3s ease;
  box-shadow: var(--shadow-sm);
}

.btn-primary:hover {
  background: var(--btn-primary-hover);
  box-shadow: var(--shadow-colored);
  transform: translateY(-2px);
}

.btn-secondary {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  font-size: 14px;
  transition: all 0.2s;
}

.btn-secondary:hover {
  background: var(--card-hover-bg);
}

.view-switcher {
  display: flex;
  gap: 4px;
  padding: 4px;
  background: var(--bg-secondary);
  border-radius: 8px;
}

.view-switcher button {
  padding: 6px;
  border-radius: 6px;
  color: var(--text-secondary);
  transition: all 0.2s;
}

.view-switcher button:hover {
  background: var(--card-hover-bg);
  color: var(--text-primary);
}

.view-switcher button.active {
  background: var(--primary-color);
  color: white;
}

.apps-grid {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-content: start;
}

.apps-grid.size-small .app-item {
  width: 110px;
  min-height: 120px;
}

.apps-grid.size-medium .app-item {
  width: 140px;
  min-height: 150px;
}

.apps-grid.size-large .app-item {
  width: 180px;
  min-height: 190px;
}

.app-item {
  cursor: grab;
  transition: opacity 0.2s;
}

.app-item:active {
  cursor: grabbing;
}

/* Sortable.js 样式 */
.sortable-ghost {
  opacity: 0.3;
  background: rgba(59, 130, 246, 0.1);
  border: 2px dashed var(--primary-color);
}

.sortable-chosen {
  cursor: grabbing !important;
  transform: scale(1.03);
  transition: transform 0.2s ease;
}

.sortable-drag {
  opacity: 0.9;
  cursor: grabbing !important;
}

.sortable-fallback {
  opacity: 1 !important;
  transform: scale(1.15) rotate(5deg) !important;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5) !important;
  cursor: grabbing !important;
  z-index: 9999 !important;
  background: var(--card-bg) !important;
  border-radius: 12px !important;
  transition: none !important;
}

.sortable-swap-highlight {
  background: rgba(59, 130, 246, 0.1);
  border: 2px solid var(--primary-color);
}

.empty-state {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: var(--text-secondary);
  gap: 16px;
}

.empty-state p {
  font-size: 16px;
}

.empty-hint {
  font-size: 14px !important;
  opacity: 0.7;
}
</style>
