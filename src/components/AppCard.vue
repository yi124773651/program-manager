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
        v-if="iconUrl"
        :src="iconUrl"
        :alt="app.name"
        class="app-icon"
        loading="lazy"
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
        <!-- 启动选项 -->
        <div class="menu-item" @click="handleLaunch">
          <PlayIcon :size="14" />
          <span>启动</span>
        </div>
        <div class="menu-item" @click="handleLaunchAsAdmin">
          <ShieldIcon :size="14" />
          <span>以管理员身份运行</span>
        </div>

        <div class="menu-divider"></div>

        <!-- 快捷动作列表 -->
        <div
          v-for="action in enabledActions"
          :key="action.id"
          class="menu-item"
          @click="handleRunAction(action)"
        >
          <component :is="getActionIcon(action)" :size="14" />
          <span>{{ action.name }}</span>
        </div>

        <div class="menu-divider" v-if="enabledActions.length > 0"></div>

        <!-- 管理动作入口 -->
        <div class="menu-item" @click="handleManageActions">
          <SettingsIcon :size="14" />
          <span>管理快捷动作...</span>
        </div>

        <div class="menu-divider"></div>

        <!-- 删除 -->
        <div class="menu-item danger" @click="handleDelete">
          <TrashIcon :size="14" />
          <span>删除</span>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- 动作管理对话框 -->
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="showActionsManager" class="modal-overlay" @click.self="showActionsManager = false">
        <div class="modal-dialog">
          <div class="modal-header">
            <h3>管理快捷动作</h3>
            <button class="close-btn" @click="showActionsManager = false">
              <XIcon :size="18" />
            </button>
          </div>
          <div class="modal-body">
            <p class="modal-tip">选择要在右键菜单中显示的快捷动作：</p>

            <div v-for="group in actionGroups" :key="group.id" class="action-group">
              <div class="group-header">
                <component :is="getGroupIcon(group.icon)" :size="16" />
                <span>{{ group.name }}</span>
              </div>
              <div class="action-list">
                <label
                  v-for="action in getGroupActions(group.id)"
                  :key="action.id"
                  class="action-item"
                >
                  <input
                    type="checkbox"
                    :checked="actionsStore.isActionEnabled(action.id)"
                    @change="actionsStore.toggleAction(action.id)"
                  />
                  <div class="action-info">
                    <span class="action-name">{{ action.name }}</span>
                    <span class="action-desc">{{ action.description }}</span>
                  </div>
                </label>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" @click="actionsStore.resetToDefault()">
              恢复默认
            </button>
            <button class="btn-primary" @click="showActionsManager = false">
              完成
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useAppStore } from '@/stores/appStore'
import { useActionsStore } from '@/stores/actionsStore'
import {
  FileIcon, PlayIcon, TrashIcon, ShieldIcon,
  FolderOpenIcon, LinkIcon, CopyIcon,
  XCircleIcon,
  SettingsIcon, XIcon, FolderIcon, CpuIcon
} from 'lucide-vue-next'
import type { App, ActionTemplate, ActionGroup } from '@/types'
import { CARD_SIZES, ACTION_GROUPS, getActionsByGroup } from '@/types'
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
const actionsStore = useActionsStore()
const showMenu = ref(false)
const showActionsManager = ref(false)
const menuStyle = ref({})
const iconError = ref(false)

// 图标 URL（从缓存或异步加载）
const iconUrl = ref<string | undefined>(undefined)

// 加载图标 URL
const loadIconUrl = async () => {
  // 先检查缓存
  if (appStore.iconUrlCache[props.app.id]) {
    iconUrl.value = appStore.iconUrlCache[props.app.id]
    return
  }

  // 如果是 base64 格式，直接使用
  if (props.app.icon?.startsWith('data:')) {
    iconUrl.value = props.app.icon
    return
  }

  // 异步加载
  if (props.app.icon) {
    const url = await appStore.getAppIconUrl(props.app.id)
    iconUrl.value = url
  }
}

// 监听 app 变化重新加载图标
watch(() => props.app.id, loadIconUrl, { immediate: true })

// 监听缓存变化
watch(
  () => appStore.iconUrlCache[props.app.id],
  (newUrl) => {
    if (newUrl) {
      iconUrl.value = newUrl
    }
  }
)

const sizeClass = computed(() => `size-${props.size}`)
const iconSize = computed(() => CARD_SIZES[props.size].iconSize)

// 获取启用的动作（排除"以管理员身份运行"，因为已经单独显示）
const enabledActions = computed(() => {
  return actionsStore.enabledPresetActions.filter(a => a.id !== 'run_as_admin')
})

const actionGroups = ACTION_GROUPS

// 初始化 actionsStore
onMounted(() => {
  actionsStore.init()
  // 不再在每个卡片上注册全局监听器，而是在显示菜单时添加
})

onUnmounted(() => {
  // 清理（如果菜单打开时组件被销毁）
  if (showMenu.value) {
    document.removeEventListener('click', handleClickOutside)
  }
})

function getGroupActions(groupId: ActionGroup) {
  return getActionsByGroup(groupId)
}

// 图标映射
function getActionIcon(action: ActionTemplate) {
  const iconMap: Record<string, any> = {
    'folder-open': FolderOpenIcon,
    'link': LinkIcon,
    'copy': CopyIcon,
    'x-circle': XCircleIcon,
    'shield': ShieldIcon
  }
  return iconMap[action.icon] || SettingsIcon
}

function getGroupIcon(icon: string) {
  const iconMap: Record<string, any> = {
    'folder': FolderIcon,
    'cpu': CpuIcon
  }
  return iconMap[icon] || FolderIcon
}

const handleLaunch = async () => {
  hideMenu()
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

  // 只在菜单显示时添加全局监听器
  document.addEventListener('click', handleClickOutside)

  menuStyle.value = {
    left: `${event.clientX}px`,
    top: `${event.clientY}px`,
  }
}

const hideMenu = () => {
  showMenu.value = false
  // 菜单关闭时移除监听器
  document.removeEventListener('click', handleClickOutside)
}

const handleClickOutside = () => {
  if (showMenu.value) {
    hideMenu()
  }
}

const handleLaunchAsAdmin = async () => {
  hideMenu()
  try {
    const result = await actionsStore.executeAction('run_as_admin', props.app.path, props.app.name)
    if (!result.success) {
      const errorMsg = result.errorOutput || result.output || '未知错误'
      alert(`以管理员身份运行失败:\n${errorMsg}`)
    }
  } catch (error) {
    alert(`以管理员身份运行失败: ${error}`)
  }
}

const handleRunAction = async (action: ActionTemplate) => {
  hideMenu()

  try {
    const result = await actionsStore.executeAction(action.id, props.app.path, props.app.name)

    // 处理执行失败的情况 - 总是显示错误
    if (!result.success) {
      const errorMsg = result.errorOutput || result.output || '未知错误'
      alert(`执行失败:\n${errorMsg}`)
      return
    }

    // 执行成功时，根据 showOutput 决定是否显示结果
    if (action.showOutput) {
      // 显示输出内容
      if (result.output) {
        alert(result.output)
      } else {
        alert('执行成功')
      }
    }
    // showOutput 为 false 时，成功不显示任何内容（静默成功）
  } catch (error) {
    alert(`执行失败: ${error}`)
  }
}

const handleManageActions = () => {
  hideMenu()
  showActionsManager.value = true
}

const handleDelete = async () => {
  const appName = props.app.name
  const appId = props.app.id

  const confirmed = await ask(`确定要删除"${appName}"吗？`, {
    title: '确认删除',
    kind: 'warning'
  })

  if (confirmed) {
    hideMenu()
    appStore.deleteApp(appId)
  } else {
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

.app-card:active {
  cursor: grabbing;
  opacity: 0.6;
}

.app-card[draggable="true"] {
  cursor: grab;
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

/* 右键菜单 */
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
  min-width: 180px;
  max-height: 400px;
  overflow-y: auto;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 6px;
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
  margin: 6px 0;
}

/* 模态框 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1001;
  backdrop-filter: blur(4px);
}

.modal-dialog {
  width: 500px;
  max-width: 95vw;
  max-height: 80vh;
  background: var(--bg-primary);
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-color);
}

.modal-header h3 {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
}

.close-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  transition: all 0.2s;
}

.close-btn:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
}

.modal-tip {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0 0 20px 0;
}

.action-group {
  margin-bottom: 20px;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.action-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.action-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
}

.action-item:hover {
  background: var(--bg-secondary);
}

.action-item input[type="checkbox"] {
  width: 18px;
  height: 18px;
  margin-top: 2px;
  accent-color: var(--primary-color);
  cursor: pointer;
}

.action-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.action-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.action-desc {
  font-size: 12px;
  color: var(--text-secondary);
}

.modal-footer {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid var(--border-color);
}

.btn-primary,
.btn-secondary {
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
}

.btn-primary {
  background: var(--primary-color);
  color: white;
}

.btn-primary:hover {
  background: var(--primary-hover);
}

.btn-secondary {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.btn-secondary:hover {
  background: var(--bg-tertiary);
}

/* 动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.modal-enter-active,
.modal-leave-active {
  transition: all 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-dialog,
.modal-leave-to .modal-dialog {
  transform: scale(0.95);
}
</style>
