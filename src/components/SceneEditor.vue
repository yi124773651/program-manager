<template>
  <div class="scene-editor-overlay" @click.self="$emit('close')">
    <div class="scene-editor">
      <!-- 头部 -->
      <div class="editor-header">
        <div class="scene-info">
          <button class="icon-picker" @click="showIconPicker = !showIconPicker">
            {{ localScene.icon }}
          </button>
          <input
            v-model="localScene.name"
            class="scene-name-input"
            placeholder="场景名称"
            @blur="updateSceneName"
          />
        </div>
        <button class="close-btn" @click="$emit('close')">
          <XIcon :size="20" />
        </button>
      </div>

      <!-- 图标选择器 -->
      <div v-if="showIconPicker" class="icon-picker-dropdown">
        <div
          v-for="icon in SCENE_ICONS"
          :key="icon"
          class="icon-option"
          :class="{ active: localScene.icon === icon }"
          @click="selectIcon(icon)"
        >
          {{ icon }}
        </div>
      </div>

      <!-- 动作列表 -->
      <div class="actions-container">
        <div class="actions-header">
          <span>动作列表</span>
          <span class="actions-count">{{ localScene.actions.length }} 个动作</span>
        </div>

        <div ref="actionsListRef" class="actions-list">
          <div
            v-for="(action, index) in localScene.actions"
            :key="action.id"
            class="action-item"
          >
            <div class="action-drag-handle">
              <GripVerticalIcon :size="16" />
            </div>
            <div class="action-icon">
              <component :is="getActionIcon(action.type)" :size="18" />
            </div>
            <div class="action-content">
              <span class="action-type">{{ getActionTypeName(action.type) }}</span>
              <span class="action-detail">{{ getActionDetail(action) }}</span>
            </div>
            <button class="action-delete" @click="removeAction(index)">
              <TrashIcon :size="14" />
            </button>
          </div>

          <div v-if="localScene.actions.length === 0" class="empty-actions">
            <ZapIcon :size="32" />
            <p>暂无动作</p>
            <span>点击下方按钮添加动作</span>
          </div>
        </div>
      </div>

      <!-- 添加动作按钮 -->
      <div class="add-action-section">
        <button class="add-action-btn" @click="showActionPicker = true">
          <PlusIcon :size="18" />
          <span>添加动作</span>
        </button>
      </div>

      <!-- 底部操作 -->
      <div class="editor-footer">
        <button class="btn-test" @click="testScene" :disabled="localScene.actions.length === 0 || scenesStore.executing">
          <PlayIcon :size="16" />
          <span>{{ scenesStore.executing ? '执行中...' : '测试运行' }}</span>
        </button>
        <button class="btn-done" @click="$emit('close')">完成</button>
      </div>
    </div>

    <!-- 动作类型选择器 -->
    <Transition name="slide-up">
      <div v-if="showActionPicker" class="action-picker-overlay" @click.self="showActionPicker = false">
        <div class="action-picker">
          <div class="picker-header">
            <h3>选择动作类型</h3>
            <button class="close-btn" @click="showActionPicker = false">
              <XIcon :size="18" />
            </button>
          </div>
          <div class="action-types-grid">
            <div
              v-for="actionType in SCENE_ACTION_TYPES"
              :key="actionType.type"
              class="action-type-card"
              @click="selectActionType(actionType)"
            >
              <div class="action-type-icon">
                <component :is="getActionIcon(actionType.type)" :size="24" />
              </div>
              <div class="action-type-info">
                <span class="action-type-name">{{ actionType.name }}</span>
                <span class="action-type-desc">{{ actionType.description }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- 动作参数配置 -->
    <Transition name="slide-up">
      <div v-if="showActionConfig" class="action-config-overlay" @click.self="cancelActionConfig">
        <div class="action-config">
          <div class="config-header">
            <button class="back-btn" @click="backToActionPicker">
              <ArrowLeftIcon :size="18" />
            </button>
            <h3>{{ selectedActionType?.name }}</h3>
            <div style="width: 36px"></div>
          </div>
          <div class="config-body">
            <!-- 选择应用 - 树形结构 -->
            <div v-if="selectedActionType?.needsApp" class="config-field">
              <label>选择应用</label>
              <div class="app-tree">
                <div v-for="category in appCategories" :key="category.id" class="app-tree-category">
                  <div class="category-header">
                    <FolderOpenIcon :size="14" />
                    <span>{{ category.name }}</span>
                    <span class="category-count">{{ category.apps.length }}</span>
                  </div>
                  <div class="category-apps">
                    <div
                      v-for="app in category.apps"
                      :key="app.id"
                      class="app-item"
                      :class="{ selected: actionParams.appId === app.id }"
                      @click="actionParams.appId = app.id"
                    >
                      <img v-if="app.icon" :src="app.icon" class="app-icon" />
                      <div v-else class="app-icon-placeholder">
                        <FileIcon :size="14" />
                      </div>
                      <span class="app-name">{{ app.name }}</span>
                    </div>
                  </div>
                </div>
                <div v-if="appCategories.length === 0" class="empty-apps">
                  暂无应用，请先添加应用
                </div>
              </div>
            </div>

            <!-- 输入 URL -->
            <div v-if="selectedActionType?.needsUrl" class="config-field">
              <label>网址</label>
              <input v-model="actionParams.url" type="url" class="config-input" placeholder="https://example.com" />
            </div>

            <!-- 选择路径 -->
            <div v-if="selectedActionType?.needsPath" class="config-field">
              <label>{{ selectedActionType.type === 'open_folder' ? '文件夹路径' : '文件路径' }}</label>
              <div class="path-input-group">
                <input v-model="actionParams.path" type="text" class="config-input" placeholder="点击浏览选择" readonly />
                <button class="browse-btn" @click="browsePath">浏览</button>
              </div>
            </div>

            <!-- 延迟秒数 -->
            <div v-if="selectedActionType?.needsSeconds" class="config-field">
              <label>延迟时间（秒）</label>
              <input v-model.number="actionParams.seconds" type="number" class="config-input" min="1" max="60" />
            </div>

            <!-- 通知消息 -->
            <div v-if="selectedActionType?.needsMessage" class="config-field">
              <label>通知内容</label>
              <input v-model="actionParams.message" type="text" class="config-input" placeholder="场景执行完成" />
            </div>
          </div>
          <div class="config-footer">
            <button class="btn-cancel" @click="cancelActionConfig">取消</button>
            <button class="btn-confirm" @click="confirmAddAction" :disabled="!isActionValid">添加</button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, nextTick, watch } from 'vue'
import { useScenesStore } from '@/stores/scenesStore'
import { useAppStore } from '@/stores/appStore'
import { XIcon, PlusIcon, TrashIcon, GripVerticalIcon, PlayIcon, ArrowLeftIcon, ZapIcon, RocketIcon, ShieldIcon, GlobeIcon, FolderOpenIcon, FileIcon, XCircleIcon, ClockIcon, BellIcon } from 'lucide-vue-next'
import { open } from '@tauri-apps/plugin-dialog'
import type { Scene, SceneAction, SceneActionType, App } from '@/types'
import { SCENE_ICONS, SCENE_ACTION_TYPES } from '@/types'
import Sortable from 'sortablejs'

const props = defineProps<{ scene: Scene }>()
const emit = defineEmits<{ close: [] }>()

const scenesStore = useScenesStore()
const appStore = useAppStore()

const localScene = reactive<Scene>({ ...props.scene, actions: [...props.scene.actions] })
const showIconPicker = ref(false)
const showActionPicker = ref(false)
const showActionConfig = ref(false)
const selectedActionType = ref<typeof SCENE_ACTION_TYPES[number] | null>(null)
const actionsListRef = ref<HTMLElement | null>(null)
const sortableInstance = ref<any>(null)

const actionParams = reactive({ appId: '', url: '', path: '', seconds: 2, message: '' })

// 按分类组织的应用列表
const appCategories = computed(() => {
  const categories = appStore.categories
  return categories.map(cat => ({
    id: cat.id,
    name: cat.name,
    apps: cat.apps
      .map(appId => appStore.config.apps[appId])
      .filter((app): app is App => app !== undefined)
  })).filter(cat => cat.apps.length > 0)
})

const isActionValid = computed(() => {
  if (!selectedActionType.value) return false
  if (selectedActionType.value.needsApp && !actionParams.appId) return false
  if (selectedActionType.value.needsUrl && !actionParams.url) return false
  if (selectedActionType.value.needsPath && !actionParams.path) return false
  if (selectedActionType.value.needsSeconds && (!actionParams.seconds || actionParams.seconds < 1)) return false
  if (selectedActionType.value.needsMessage && !actionParams.message) return false
  return true
})

function getActionIcon(type: SceneActionType) {
  const map: Record<SceneActionType, any> = {
    'launch': RocketIcon, 'launch_admin': ShieldIcon, 'open_url': GlobeIcon,
    'open_folder': FolderOpenIcon, 'open_file': FileIcon, 'close_app': XCircleIcon,
    'delay': ClockIcon, 'notify': BellIcon
  }
  return map[type] || RocketIcon
}

function getActionTypeName(type: SceneActionType): string {
  return SCENE_ACTION_TYPES.find(t => t.type === type)?.name || type
}

function getActionDetail(action: SceneAction): string {
  switch (action.type) {
    case 'launch': case 'launch_admin': case 'close_app':
      return action.params.appId ? (appStore.config.apps[action.params.appId]?.name || '未知应用') : '未指定'
    case 'open_url': return action.params.url || '未指定'
    case 'open_folder': case 'open_file': return action.params.path || '未指定'
    case 'delay': return `${action.params.seconds || 1} 秒`
    case 'notify': return action.params.message || '未指定'
    default: return ''
  }
}

function selectIcon(icon: string) {
  localScene.icon = icon
  showIconPicker.value = false
  scenesStore.updateScene(localScene.id, { icon })
}

function updateSceneName() {
  if (localScene.name.trim()) scenesStore.updateScene(localScene.id, { name: localScene.name.trim() })
}

function selectActionType(actionType: typeof SCENE_ACTION_TYPES[number]) {
  selectedActionType.value = actionType
  showActionPicker.value = false
  showActionConfig.value = true
  Object.assign(actionParams, { appId: '', url: '', path: '', seconds: 2, message: '' })
}

function backToActionPicker() {
  showActionConfig.value = false
  showActionPicker.value = true
}

function cancelActionConfig() {
  showActionConfig.value = false
  selectedActionType.value = null
}

async function browsePath() {
  if (!selectedActionType.value) return
  const selected = await open({ directory: selectedActionType.value.type === 'open_folder', multiple: false })
  if (selected) actionParams.path = selected as string
}

function confirmAddAction() {
  if (!selectedActionType.value || !isActionValid.value) return
  const newAction = scenesStore.addActionToScene(localScene.id, {
    type: selectedActionType.value.type,
    params: { appId: actionParams.appId || undefined, url: actionParams.url || undefined, path: actionParams.path || undefined, seconds: actionParams.seconds || undefined, message: actionParams.message || undefined }
  })
  if (newAction) localScene.actions.push(newAction)
  showActionConfig.value = false
  selectedActionType.value = null
}

function removeAction(index: number) {
  const action = localScene.actions[index]
  if (action) {
    scenesStore.removeActionFromScene(localScene.id, action.id)
    localScene.actions.splice(index, 1)
  }
}

async function testScene() {
  if (localScene.actions.length === 0 || scenesStore.executing) return
  const result = await scenesStore.executeScene(localScene.id)
  if (!result.success && result.error) alert(`执行失败: ${result.error}`)
  else alert(`执行完成！成功 ${result.completedActions}/${result.totalActions} 个动作`)
}

function initSortable() {
  if (!actionsListRef.value) return
  if (sortableInstance.value) sortableInstance.value.destroy()

  // 确保有动作才初始化
  if (localScene.actions.length === 0) return

  sortableInstance.value = Sortable.create(actionsListRef.value, {
    animation: 200,
    handle: '.action-drag-handle',
    draggable: '.action-item',
    ghostClass: 'action-ghost',
    chosenClass: 'action-chosen',
    dragClass: 'action-drag',
    filter: '.empty-actions',
    forceFallback: true,
    fallbackClass: 'action-fallback',
    onEnd: (evt) => {
      if (evt.oldIndex !== undefined && evt.newIndex !== undefined && evt.oldIndex !== evt.newIndex) {
        const [removed] = localScene.actions.splice(evt.oldIndex, 1)
        localScene.actions.splice(evt.newIndex, 0, removed)
        scenesStore.reorderActions(localScene.id, evt.oldIndex, evt.newIndex)
      }
    }
  })
}

// 监听动作列表变化，重新初始化拖拽
watch(() => localScene.actions.length, () => {
  nextTick(initSortable)
})

watch(() => props.scene, (n) => Object.assign(localScene, { ...n, actions: [...n.actions] }), { deep: true })
onMounted(() => nextTick(initSortable))
</script>

<style scoped>
.scene-editor-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; backdrop-filter: blur(4px); }
.scene-editor { width: 500px; max-width: 95vw; max-height: 85vh; background: var(--bg-primary); border-radius: 16px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); display: flex; flex-direction: column; overflow: hidden; }
.editor-header { display: flex; align-items: center; justify-content: space-between; padding: 20px; border-bottom: 1px solid var(--border-color); }
.scene-info { display: flex; align-items: center; gap: 12px; flex: 1; }
.icon-picker { width: 48px; height: 48px; border-radius: 12px; background: var(--bg-secondary); font-size: 24px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; }
.icon-picker:hover { background: var(--bg-tertiary); transform: scale(1.05); }
.scene-name-input { flex: 1; font-size: 18px; font-weight: 600; border: none; background: transparent; color: var(--text-primary); padding: 8px 0; }
.scene-name-input:focus { outline: none; }
.close-btn { width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: var(--text-secondary); transition: all 0.2s; }
.close-btn:hover { background: var(--bg-secondary); color: var(--text-primary); }
.icon-picker-dropdown { display: flex; flex-wrap: wrap; gap: 8px; padding: 12px 20px; border-bottom: 1px solid var(--border-color); background: var(--bg-secondary); }
.icon-option { width: 40px; height: 40px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 20px; cursor: pointer; transition: all 0.2s; }
.icon-option:hover { background: var(--bg-tertiary); transform: scale(1.1); }
.icon-option.active { background: var(--primary-color); }
.actions-container { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.actions-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px 8px; font-size: 13px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; }
.actions-count { font-weight: 400; text-transform: none; }
.actions-list { flex: 1; overflow-y: auto; padding: 8px 12px; min-height: 200px; max-height: 300px; }
.action-item { display: flex; align-items: center; gap: 10px; padding: 12px; background: var(--bg-secondary); border-radius: 10px; margin-bottom: 8px; transition: all 0.2s; }
.action-item:hover { background: var(--bg-tertiary); }
.action-drag-handle { cursor: grab; color: var(--text-secondary); padding: 8px; margin: -8px; margin-right: 2px; }
.action-drag-handle:hover { color: var(--text-primary); }
.action-drag-handle:active { cursor: grabbing; }
.action-icon { width: 36px; height: 36px; border-radius: 8px; background: var(--primary-color); color: white; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.action-content { flex: 1; min-width: 0; }
.action-type { display: block; font-size: 14px; font-weight: 500; color: var(--text-primary); }
.action-detail { display: block; font-size: 12px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.action-delete { width: 28px; height: 28px; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: var(--text-secondary); transition: all 0.2s; flex-shrink: 0; }
.action-delete:hover { background: rgba(255,59,48,0.1); color: var(--danger-color); }
.action-ghost { opacity: 0.4; background: var(--primary-color) !important; border-radius: 10px; }
.action-chosen { background: var(--bg-tertiary) !important; box-shadow: 0 4px 12px rgba(0,0,0,0.15); transform: scale(1.02); }
.action-drag { opacity: 0.9; }
.action-fallback { opacity: 1 !important; box-shadow: 0 8px 24px rgba(0,0,0,0.25) !important; transform: scale(1.05) !important; background: var(--bg-primary) !important; border-radius: 10px !important; z-index: 9999 !important; }
.empty-actions { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 20px; color: var(--text-secondary); }
.empty-actions p { margin: 12px 0 4px; font-size: 15px; font-weight: 500; }
.empty-actions span { font-size: 13px; }
.add-action-section { padding: 12px 20px; }
.add-action-btn { width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 14px; border-radius: 10px; background: var(--bg-secondary); color: var(--primary-color); font-size: 14px; font-weight: 500; transition: all 0.2s; }
.add-action-btn:hover { background: var(--primary-color); color: white; }
.editor-footer { display: flex; gap: 12px; padding: 16px 20px; border-top: 1px solid var(--border-color); }
.btn-test, .btn-done { flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 12px; border-radius: 8px; font-size: 14px; font-weight: 500; transition: all 0.2s; }
.btn-test { background: var(--bg-secondary); color: var(--text-primary); }
.btn-test:hover:not(:disabled) { background: var(--bg-tertiary); }
.btn-test:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-done { background: var(--primary-color); color: white; }
.btn-done:hover { background: var(--primary-hover); }
.action-picker-overlay, .action-config-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1001; }
.action-picker, .action-config { width: 100%; max-width: 520px; max-height: 85vh; background: var(--bg-primary); border-radius: 16px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
.picker-header, .config-header { display: flex; align-items: center; justify-content: space-between; padding: 20px; border-bottom: 1px solid var(--border-color); }
.picker-header h3, .config-header h3 { font-size: 18px; font-weight: 600; margin: 0; flex: 1; text-align: center; }
.back-btn { width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: var(--text-secondary); transition: all 0.2s; }
.back-btn:hover { background: var(--bg-secondary); color: var(--text-primary); }
.action-types-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; padding: 20px; overflow-y: auto; }
.action-type-card { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 20px 12px; background: var(--bg-secondary); border-radius: 12px; cursor: pointer; transition: all 0.2s; }
.action-type-card:hover { background: var(--bg-tertiary); transform: translateY(-2px); }
.action-type-icon { width: 48px; height: 48px; border-radius: 12px; background: var(--primary-color); color: white; display: flex; align-items: center; justify-content: center; }
.action-type-info { text-align: center; }
.action-type-name { display: block; font-size: 14px; font-weight: 500; color: var(--text-primary); }
.action-type-desc { display: block; font-size: 11px; color: var(--text-secondary); margin-top: 2px; }
.config-body { flex: 1; padding: 20px; overflow-y: auto; }
.config-field { margin-bottom: 20px; }
.config-field label { display: block; font-size: 14px; font-weight: 500; color: var(--text-primary); margin-bottom: 8px; }
.config-input, .config-select { width: 100%; padding: 12px 14px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary); font-size: 14px; transition: all 0.2s; }
.config-input:focus, .config-select:focus { outline: none; border-color: var(--primary-color); }
.config-select { cursor: pointer; }
.path-input-group { display: flex; gap: 8px; }
.path-input-group .config-input { flex: 1; }
.browse-btn { padding: 12px 16px; border-radius: 8px; background: var(--primary-color); color: white; font-size: 14px; font-weight: 500; white-space: nowrap; transition: all 0.2s; }
.browse-btn:hover { background: var(--primary-hover); }
.config-footer { display: flex; gap: 12px; padding: 16px 20px; border-top: 1px solid var(--border-color); }
.btn-cancel, .btn-confirm { flex: 1; padding: 12px; border-radius: 8px; font-size: 14px; font-weight: 500; transition: all 0.2s; }
.btn-cancel { background: var(--bg-secondary); color: var(--text-primary); }
.btn-cancel:hover { background: var(--bg-tertiary); }
.btn-confirm { background: var(--primary-color); color: white; }
.btn-confirm:hover:not(:disabled) { background: var(--primary-hover); }
.btn-confirm:disabled { opacity: 0.5; cursor: not-allowed; }
.slide-up-enter-active, .slide-up-leave-active { transition: all 0.3s ease; }
.slide-up-enter-from, .slide-up-leave-to { opacity: 0; }
.slide-up-enter-from .action-picker, .slide-up-leave-to .action-picker, .slide-up-enter-from .action-config, .slide-up-leave-to .action-config { transform: scale(0.95); opacity: 0; }

/* 应用树形结构样式 */
.app-tree { max-height: 300px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-secondary); }
.app-tree-category { border-bottom: 1px solid var(--border-color); }
.app-tree-category:last-child { border-bottom: none; }
.app-tree-category .category-header { display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: var(--bg-tertiary); font-size: 13px; font-weight: 600; color: var(--text-secondary); }
.app-tree-category .category-count { margin-left: auto; font-size: 11px; font-weight: 400; background: var(--badge-bg); padding: 2px 6px; border-radius: 8px; }
.category-apps { padding: 4px; }
.app-item { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 6px; cursor: pointer; transition: all 0.15s; }
.app-item:hover { background: var(--category-hover); }
.app-item.selected { background: var(--primary-color); color: white; }
.app-icon { width: 24px; height: 24px; border-radius: 4px; object-fit: contain; flex-shrink: 0; }
.app-icon-placeholder { width: 24px; height: 24px; border-radius: 4px; background: var(--bg-tertiary); display: flex; align-items: center; justify-content: center; color: var(--text-secondary); flex-shrink: 0; }
.app-item.selected .app-icon-placeholder { background: rgba(255,255,255,0.2); color: white; }
.app-name { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.empty-apps { padding: 20px; text-align: center; color: var(--text-secondary); font-size: 13px; }
</style>
