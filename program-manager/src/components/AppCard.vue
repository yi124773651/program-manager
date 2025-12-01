<template>
  <div
    class="app-card"
    :class="sizeClass"
    v-bind="$attrs"
    @dblclick="handleLaunch"
    @contextmenu.prevent="showContextMenu"
  >
    <!-- 图标 -->
    <div class="icon-wrapper" style="pointer-events: none;">
      <img
        v-if="app.icon"
        :src="app.icon"
        :alt="app.name"
        class="app-icon"
        @error="handleIconError"
      />
      <div v-else class="icon-placeholder">
        <FileIcon :size="iconSize" />
      </div>
    </div>

    <!-- 应用名称 -->
    <div class="app-name" :title="app.name" style="pointer-events: none;">{{ app.name }}</div>
  </div>

  <!-- 右键菜单（移到外部，使用 Teleport） -->
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="showMenu"
        class="context-menu"
        :style="menuStyle"
        @click.stop
      >
        <div class="menu-item" @click="handleLaunch">
          <PlayIcon :size="14" />
          <span>启动</span>
        </div>
        <div class="menu-item" @click="handleOpenLocation">
          <FolderOpenIcon :size="14" />
          <span>打开文件位置</span>
        </div>
        <div class="menu-divider"></div>
        <div class="menu-item danger" @click="handleDelete">
          <TrashIcon :size="14" />
          <span>删除</span>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useAppStore } from '@/stores/appStore'
import { FileIcon, PlayIcon, FolderOpenIcon, TrashIcon } from 'lucide-vue-next'
import type { App } from '@/types'
import { CARD_SIZES } from '@/types'
import { invoke } from '@tauri-apps/api/core'
import { ask } from '@tauri-apps/plugin-dialog'

// 禁用自动属性继承，手动通过 v-bind="$attrs" 控制
defineOptions({
  inheritAttrs: false
})

interface Props {
  app: App
  size?: 'small' | 'medium' | 'large'
}

const props = withDefaults(defineProps<Props>(), {
  size: 'medium'
})

const appStore = useAppStore()
const showMenu = ref(false)
const menuStyle = ref({})
const iconError = ref(false)

const sizeClass = computed(() => `size-${props.size}`)
const iconSize = computed(() => CARD_SIZES[props.size].iconSize)

const handleLaunch = async () => {
  try {
    await appStore.launchApp(props.app.id)
  } catch (error) {
    alert(`启动失败: ${error}`)
  }
}

const showContextMenu = (event: MouseEvent) => {
  event.preventDefault()
  event.stopPropagation()
  showMenu.value = true

  // 使用 nextTick 确保菜单已渲染
  menuStyle.value = {
    left: `${event.clientX}px`,
    top: `${event.clientY}px`,
  }
}

const hideMenu = () => {
  showMenu.value = false
}

// 点击菜单外的任何地方关闭菜单
const handleClickOutside = () => {
  if (showMenu.value) {
    hideMenu()
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})

const handleOpenLocation = async () => {
  try {
    await invoke('open_file_location', { filePath: props.app.path })
  } catch (error) {
    console.error('打开文件位置失败:', error)
    alert(`打开文件位置失败: ${error}`)
  }
  hideMenu()
}

const handleDelete = async () => {
  // 使用 Tauri 的 ask 对话框
  const appName = props.app.name
  const appId = props.app.id

  console.log('点击删除，准备弹出确认框')
  const confirmed = await ask(`确定要删除"${appName}"吗？`, {
    title: '确认删除',
    kind: 'warning'
  })
  console.log('用户选择:', confirmed)

  if (confirmed) {
    console.log('开始删除应用:', appId)
    hideMenu()
    appStore.deleteApp(appId)
  } else {
    console.log('取消删除')
    hideMenu()
  }
}

const handleIconError = () => {
  iconError.value = true
}
</script>

<style scoped>
.app-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px;
  border-radius: 12px;
  background: var(--card-bg-transparent);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  user-select: none;
  box-shadow: var(--shadow-sm);
}

.app-card:hover {
  background: var(--card-hover-bg);
  border-color: var(--border-color);
  transform: translateY(-4px) scale(1.02);
  box-shadow: var(--shadow-md);
}

/* 拖拽状态 */
.app-card:active {
  cursor: grabbing;
}

.app-card[draggable="true"] {
  cursor: grab;
}

.app-card:active {
  opacity: 0.6;
}

.app-card.size-small {
  width: 110px;
  min-height: 120px;
}

.app-card.size-medium {
  width: 140px;
  min-height: 150px;
}

.app-card.size-large {
  width: 180px;
  min-height: 190px;
}

.icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.app-icon {
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 8px;
}

.icon-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  opacity: 0.5;
}

.app-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  max-width: 100%;
  line-height: 1.3;
}

.context-menu {
  position: fixed;
  background: var(--glass-bg);
  backdrop-filter: var(--backdrop-blur);
  -webkit-backdrop-filter: var(--backdrop-blur);
  border: 1px solid var(--glass-border);
  border-radius: 12px;
  box-shadow: var(--shadow-xl);
  padding: 6px;
  z-index: 1000;
  min-width: 160px;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s;
  font-size: 13px;
  color: var(--text-primary);
}

.menu-item:hover {
  background: var(--menu-item-hover);
}

.menu-item.danger {
  color: var(--danger-color);
}

.menu-item.danger:hover {
  background: rgba(255, 59, 48, 0.1);
}

.menu-divider {
  height: 1px;
  background: var(--border-color);
  margin: 4px 0;
}
</style>
