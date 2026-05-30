<template>
  <div class="app-wrapper">
    <!-- 背景图层 -->
    <div
      v-if="settings.backgroundImage"
      class="background-layer"
      :style="{
        backgroundImage: `url(${settings.backgroundImage})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        opacity: 1 - (settings.backgroundOpacity || 0.3)
      }"
    ></div>

    <!-- 主要内容 -->
    <div id="app" class="app-container">
      <div v-if="loading" class="loading">
        <div class="spinner"></div>
        <p>加载中...</p>
      </div>
      <MainView v-else />
    </div>

    <!-- Spotlight 搜索 -->
    <SpotlightSearch />

    <!-- 快捷便签 -->
    <QuickNotes />
  </div>
</template>

<script setup lang="ts">
import { onMounted, computed, onUnmounted, watch } from 'vue'
import { useAppStore } from './stores/appStore'
import { useSearchStore } from './stores/searchStore'
import { useNotesStore } from './stores/notesStore'
import { useClipboardStore } from './stores/clipboardStore'
import { invoke } from '@tauri-apps/api/core'
import MainView from './views/MainView.vue'
import SpotlightSearch from './components/SpotlightSearch.vue'
import QuickNotes from './components/QuickNotes.vue'
import { listen } from '@tauri-apps/api/event'
import { legacyMigrationService } from '@/services/legacyMigrationService'
import { matchesKeyboardEvent } from '@/services/shortcutService'
import { applyThemeSettings } from '@/services/themeService'
import {
  detectItemTypeFromPath,
  getItemDisplayNameFromPath
} from '@/types'

const appStore = useAppStore()
const searchStore = useSearchStore()
const notesStore = useNotesStore()
const clipboardStore = useClipboardStore()
const loading = computed(() => appStore.loading)
const settings = computed(() => appStore.settings)

let unlisten: (() => void) | null = null
let quitUnlisten: (() => void) | null = null
let mainCloseUnlisten: (() => void) | null = null
let flushingBeforeQuit = false
let hidingMainWindow = false

const flushPendingStores = async () => {
  await Promise.all([
    appStore.flushPendingSave(),
    notesStore.flushPendingSave(),
    clipboardStore.flushPendingSave()
  ])
}

const handleQuitRequested = async () => {
  if (flushingBeforeQuit) return
  flushingBeforeQuit = true

  try {
    await flushPendingStores()
  } finally {
    await invoke('quit_app')
  }
}

const handleMainCloseRequested = async () => {
  if (hidingMainWindow) return
  hidingMainWindow = true

  try {
    await flushPendingStores()
    await invoke('hide_main_window')
  } finally {
    hidingMainWindow = false
  }
}

// 快捷键处理
const handleKeydown = (event: KeyboardEvent) => {
  // 检查效率工具是否启用
  if (settings.value.quickerEnabled === false) return

  if (matchesKeyboardEvent(event, settings.value.spotlightShortcut || 'Ctrl+K', { metaAsCtrl: true })) {
    // 检查快捷搜索是否启用
    if (settings.value.spotlightSearchEnabled === false) return

    event.preventDefault()
    searchStore.toggle()
    return
  }

  if (matchesKeyboardEvent(event, settings.value.quickNotesShortcut || 'Alt+N', { metaAsCtrl: true })) {
    // 检查快捷便签是否启用
    if (settings.value.quickNotesEnabled === false) return

    event.preventDefault()
    void notesStore.toggle()
  }
}

// 主题链路集中在 themeService，确保配置导入、主题色和透明度更新走同一套 DOM 写入。
watch(() => [
  settings.value.theme,
  settings.value.themePreset,
  settings.value.themeColor,
  settings.value.windowOpacity
], () => {
  applyThemeSettings(settings.value)
}, { immediate: true })

onMounted(async () => {
  // 注册快捷键
  document.addEventListener('keydown', handleKeydown)

  try {
    await legacyMigrationService.migrateIfNeeded()
  } catch (error) {
    // 迁移失败不能阻止启动；旧 localStorage 会保留，后续启动可重试。
    console.error('旧本地数据迁移失败:', error)
  }

  await appStore.init()

  // 如果背景来源为随机图床，启动时加载一次
  if (appStore.settings.backgroundSource === 'api' && appStore.settings.backgroundApiUrl) {
    appStore.loadApiBackground()
  }

  // 初始化便签
  await notesStore.init()

  // 监听从右键菜单添加文件的事件
  unlisten = await listen<string>('add-file-from-context-menu', async (event) => {
    const filePath = event.payload
    console.log('收到右键菜单添加文件事件:', filePath)

    try {
      const lowerPath = filePath.toLowerCase()

      // 检查是否是支持的文件类型
      if (!detectItemTypeFromPath(filePath) && !lowerPath.endsWith('.lnk')) {
        alert('只能添加受支持的文件类型')
        return
      }

      // 确保有至少一个分类
      let targetCategoryId = appStore.currentCategory

      if (!targetCategoryId) {
        // 如果没有当前分类，检查是否有任何分类
        const categories = appStore.categories
        if (categories.length === 0) {
          // 创建一个默认分类
          const defaultCategory = await appStore.addCategory('我的项目')
          targetCategoryId = defaultCategory.id
          await appStore.selectCategory(targetCategoryId)
        } else {
          // 使用第一个分类
          targetCategoryId = categories[0].id
          await appStore.selectCategory(targetCategoryId)
        }
      }

      // 获取实际执行路径和应用名
      let actualPath = filePath
      let itemType = detectItemTypeFromPath(filePath)
      let itemName = getItemDisplayNameFromPath(filePath, itemType)

      if (lowerPath.endsWith('.lnk')) {
        // 解析快捷方式
        try {
          actualPath = await invoke<string>('resolve_shortcut', { lnkPath: filePath })
          itemType = detectItemTypeFromPath(actualPath) ?? 'app'
          itemName = getItemDisplayNameFromPath(filePath, 'app')
        } catch (error) {
          console.error('解析快捷方式失败:', error)
          alert(`解析快捷方式失败: ${error}`)
          return
        }
      }

      if (!itemType) {
        alert('暂不支持该文件类型')
        return
      }

      // 检查是否已存在
      if (appStore.isAppExists(actualPath)) {
        alert(`项目已存在：${itemName}`)
        return
      }

      // 添加项目
      await appStore.addApp({
        name: itemName,
        path: actualPath,
        category: targetCategoryId,
        itemType
      })

      console.log('项目添加成功:', itemName)

      // 显示成功提示
      setTimeout(() => {
        alert(`已成功添加项目：${itemName}`)
      }, 100)

    } catch (error) {
      console.error('添加项目失败:', error)
      alert(`添加项目失败: ${error}`)
    }
  })

  quitUnlisten = await listen('app-quit-requested', () => {
    void handleQuitRequested()
  })

  mainCloseUnlisten = await listen('main-window-close-requested', () => {
    void handleMainCloseRequested()
  })
})

onUnmounted(() => {
  // 移除快捷键监听
  document.removeEventListener('keydown', handleKeydown)

  if (unlisten) {
    unlisten()
  }

  if (quitUnlisten) {
    quitUnlisten()
  }

  if (mainCloseUnlisten) {
    mainCloseUnlisten()
  }

  void flushPendingStores()
})
</script>

<style scoped>
.app-wrapper {
  width: 100%;
  height: 100vh;
  position: relative;
  overflow: hidden;
}

.background-layer {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 0;
  pointer-events: none;
  transition: opacity 0.3s ease;
}

.app-container {
  position: relative;
  width: 100%;
  height: 100vh;
  overflow: hidden;
  z-index: 1;
}

.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  gap: 16px;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--border-color);
  border-top-color: var(--primary-color);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.loading p {
  color: var(--text-secondary);
  font-size: 14px;
}
</style>
