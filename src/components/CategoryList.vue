<template>
  <div class="category-list">
    <!-- 标签页切换 -->
    <div v-if="showTabs" class="sidebar-tabs">
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'categories' }"
        @click="activeTab = 'categories'"
      >
        <FolderIcon :size="16" />
        <span>分类</span>
      </button>
      <button
        v-if="showClipboardTab"
        class="tab-btn"
        :class="{ active: activeTab === 'clipboard' }"
        @click="activeTab = 'clipboard'"
      >
        <ClipboardListIcon :size="16" />
        <span>剪贴板</span>
      </button>
    </div>

    <!-- 分类面板 -->
    <template v-if="activeTab === 'categories'">
      <div class="category-header">
        <h2>分类</h2>
        <button class="add-btn" @click="handleAddCategory" title="添加分类">
          <PlusIcon :size="16" />
        </button>
      </div>

    <div ref="categoriesRef" class="categories">
      <div
        v-for="category in categories"
        :key="category.id"
        :data-category-id="category.id"
        class="category-item"
        :class="{ active: isActive(category.id) }"
        @click="selectCategory(category.id)"
        @contextmenu.prevent="showContextMenu($event, category)"
      >
        <div class="category-icon">
          <FolderIcon :size="20" />
        </div>
        <span class="category-name">{{ category.name }}</span>
        <span class="app-count">{{ category.apps.length }}</span>
      </div>

      <!-- 空状态 -->
      <div v-if="categories.length === 0" class="empty-categories">
        <p>暂无分类</p>
        <button class="btn-add-first" @click="handleAddCategory">
          <PlusIcon :size="16" />
          创建第一个分类
        </button>
      </div>
    </div>

    <!-- 场景面板 -->
    <div class="scenes-section">
      <div class="scenes-header">
        <div class="scenes-title">
          <ZapIcon :size="16" />
          <span>场景</span>
        </div>
        <button class="add-btn small" @click="handleAddScene" title="新建场景">
          <PlusIcon :size="14" />
        </button>
      </div>
      <div class="scenes-list">
        <div
          v-for="scene in scenes"
          :key="scene.id"
          class="scene-item"
          :class="{ executing: scenesStore.currentExecutingScene === scene.id }"
          @click="handleExecuteScene(scene)"
          @contextmenu.prevent="showSceneContextMenu($event, scene)"
        >
          <span class="scene-icon">{{ scene.icon }}</span>
          <span class="scene-name">{{ scene.name }}</span>
          <span v-if="scenesStore.currentExecutingScene === scene.id" class="scene-progress">
            {{ scenesStore.executionProgress }}%
          </span>
          <span v-else class="scene-actions-count">{{ scene.actions.length }}</span>
        </div>
        <div v-if="scenes.length === 0" class="empty-scenes">
          <span>点击 + 创建场景</span>
        </div>
      </div>
    </div>

    <!-- 设置按钮 -->
    <div class="settings-footer">
      <button class="maintenance-btn" @click="showMaintenance = true" title="程序维护">
        <WrenchIcon :size="18" />
        <span>维护</span>
      </button>
      <button class="settings-btn" @click="showSettings = true" title="设置">
        <SettingsIcon :size="18" />
        <span>设置</span>
      </button>
      <div class="footer-right">
        <button class="github-link" @click="openGitHub" title="GitHub">
          <GithubIcon :size="18" />
        </button>
        <span class="version-text">v1.1.0</span>
      </div>
    </div>
    </template>

    <!-- 剪贴板面板 - 在侧边栏内显示 -->
    <ClipboardHistory v-else-if="activeTab === 'clipboard'" />

    <!-- 设置对话框 -->
    <Teleport to="body">
      <Transition name="fade">
        <SettingsDialog v-if="showSettings" @close="showSettings = false" />
      </Transition>
      <Transition name="fade">
        <MaintenancePanel v-if="showMaintenance" @close="showMaintenance = false" />
      </Transition>
    </Teleport>

    <!-- 右键菜单 -->
    <Transition name="fade">
      <div
        v-if="contextMenu.show"
        class="context-menu"
        :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
        @click.stop
      >
        <div class="menu-item" @click="handleRename">
          <Edit2Icon :size="14" />
          <span>重命名</span>
        </div>
        <div class="menu-item danger" @click="handleDelete">
          <TrashIcon :size="14" />
          <span>删除</span>
        </div>
      </div>
    </Transition>

    <!-- 场景右键菜单 -->
    <Transition name="fade">
      <div
        v-if="sceneContextMenu.show"
        class="context-menu"
        :style="{ left: sceneContextMenu.x + 'px', top: sceneContextMenu.y + 'px' }"
        @click.stop
      >
        <div class="menu-item" @click="handleEditScene">
          <Edit2Icon :size="14" />
          <span>编辑场景</span>
        </div>
        <div class="menu-item danger" @click="handleDeleteScene">
          <TrashIcon :size="14" />
          <span>删除</span>
        </div>
      </div>
    </Transition>

    <!-- 场景编辑器 -->
    <Teleport to="body">
      <Transition name="fade">
        <SceneEditor
          v-if="showSceneEditor && editingScene"
          :scene="editingScene"
          @close="closeSceneEditor"
        />
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, nextTick } from 'vue'
import { useAppStore } from '@/stores/appStore'
import { useScenesStore } from '@/stores/scenesStore'
import { FolderIcon, PlusIcon, Edit2Icon, TrashIcon, SettingsIcon, WrenchIcon, ClipboardListIcon, ZapIcon, GithubIcon } from 'lucide-vue-next'
import type { Category, Scene } from '@/types'
import { SCENE_ICONS } from '@/types'
import Sortable from 'sortablejs'
import SettingsDialog from './SettingsDialog.vue'
import MaintenancePanel from './MaintenancePanel.vue'
import ClipboardHistory from './ClipboardHistory.vue'
import SceneEditor from './SceneEditor.vue'

const appStore = useAppStore()
const scenesStore = useScenesStore()
const categories = computed(() => appStore.categories)
const scenes = computed(() => scenesStore.allScenes)
const categoriesRef = ref<HTMLElement | null>(null)
const sortableInstance = ref<any>(null)

const showSettings = ref(false)
const showMaintenance = ref(false)
const activeTab = ref<'categories' | 'clipboard'>('categories')

// 场景编辑器状态
const showSceneEditor = ref(false)
const editingScene = ref<Scene | null>(null)

// 是否显示剪贴板标签（根据设置）
const showClipboardTab = computed(() => {
  const settings = appStore.settings
  return settings.quickerEnabled !== false && settings.clipboardHistoryEnabled !== false
})

// 是否显示标签栏（有多个功能启用时显示）
const showTabs = computed(() => {
  return showClipboardTab.value
})

const contextMenu = ref({
  show: false,
  x: 0,
  y: 0,
  category: null as Category | null
})

const sceneContextMenu = ref({
  show: false,
  x: 0,
  y: 0,
  scene: null as Scene | null
})

const isActive = (categoryId: string) => {
  return appStore.currentCategory === categoryId
}

const selectCategory = (categoryId: string) => {
  appStore.selectCategory(categoryId)
}

const handleAddCategory = () => {
  const name = prompt('请输入分类名称：')
  if (name && name.trim()) {
    appStore.addCategory(name.trim())
  }
}

const showContextMenu = (event: MouseEvent, category: Category) => {
  contextMenu.value = {
    show: true,
    x: event.clientX,
    y: event.clientY,
    category
  }
}

const hideContextMenu = () => {
  contextMenu.value.show = false
}

const handleRename = () => {
  const category = contextMenu.value.category
  if (!category) return

  const newName = prompt('请输入新名称：', category.name)
  if (newName && newName.trim() && newName !== category.name) {
    category.name = newName.trim()
    appStore.saveConfig()
  }
  hideContextMenu()
}

const handleDelete = async () => {
  const category = contextMenu.value.category
  if (!category) return

  // 先隐藏菜单
  hideContextMenu()

  const confirmMsg = category.apps.length > 0
    ? `分类"${category.name}"中有 ${category.apps.length} 个应用，删除后应用也会被删除。确定继续吗？`
    : `确定要删除分类"${category.name}"吗？`

  // 使用 Tauri 的 dialog
  const { ask } = await import('@tauri-apps/plugin-dialog')
  const confirmed = await ask(confirmMsg, {
    title: '确认删除',
    kind: 'warning'
  })

  if (confirmed) {
    await appStore.deleteCategory(category.id)
  }
}

// ============ 场景相关函数 ============

// 初始化场景 store
const initScenes = () => {
  scenesStore.init()
}

// 新建场景
const handleAddScene = async () => {
  const name = prompt('请输入场景名称：')
  if (!name || !name.trim()) return

  const randomIcon = SCENE_ICONS[Math.floor(Math.random() * SCENE_ICONS.length)]
  const newScene = scenesStore.addScene({
    name: name.trim(),
    icon: randomIcon,
    actions: []
  })

  // 创建后打开编辑器
  if (newScene) {
    editingScene.value = { ...newScene, actions: [...newScene.actions] }
    showSceneEditor.value = true
  }
}

// 执行场景
const handleExecuteScene = async (scene: Scene) => {
  if (scenesStore.executing) {
    alert('正在执行其他场景，请稍候...')
    return
  }

  if (scene.actions.length === 0) {
    // 如果没有动作，打开编辑器
    const latestScene = scenesStore.scenes.find(s => s.id === scene.id)
    if (latestScene) {
      editingScene.value = { ...latestScene, actions: [...latestScene.actions] }
      showSceneEditor.value = true
    }
    return
  }

  const result = await scenesStore.executeScene(scene.id)
  if (!result.success && result.error) {
    alert(`场景执行失败: ${result.error}`)
  }
}

// 显示场景右键菜单
const showSceneContextMenu = (event: MouseEvent, scene: Scene) => {
  sceneContextMenu.value = {
    show: true,
    x: event.clientX,
    y: event.clientY,
    scene
  }
}

// 隐藏场景右键菜单
const hideSceneContextMenu = () => {
  sceneContextMenu.value.show = false
}

// 编辑场景
const handleEditScene = () => {
  const scene = sceneContextMenu.value.scene
  if (scene) {
    // 从 store 获取最新的 scene 对象
    const latestScene = scenesStore.scenes.find(s => s.id === scene.id)
    if (latestScene) {
      editingScene.value = { ...latestScene, actions: [...latestScene.actions] }
      showSceneEditor.value = true
    }
  }
  hideSceneContextMenu()
}

// 删除场景
const handleDeleteScene = async () => {
  const scene = sceneContextMenu.value.scene
  if (!scene) return

  hideSceneContextMenu()

  const { ask } = await import('@tauri-apps/plugin-dialog')
  const confirmed = await ask(`确定要删除场景"${scene.name}"吗？`, {
    title: '确认删除',
    kind: 'warning'
  })

  if (confirmed) {
    scenesStore.deleteScene(scene.id)
  }
}

// 关闭场景编辑器
const closeSceneEditor = () => {
  showSceneEditor.value = false
  editingScene.value = null
}

// 打开 GitHub 仓库
const openGitHub = async () => {
  const { open } = await import('@tauri-apps/plugin-shell')
  await open('https://github.com/yi124773651/program-manager')
}

// 初始化分类拖拽排序
const initSortable = () => {
  if (!categoriesRef.value) return

  // 销毁之前的实例
  if (sortableInstance.value) {
    sortableInstance.value.destroy()
    sortableInstance.value = null
  }

  let lastHighlightedElement: HTMLElement | null = null
  let targetCategoryId: string | null = null

  sortableInstance.value = Sortable.create(categoriesRef.value, {
    animation: 250,
    forceFallback: true,
    fallbackOnBody: true,
    fallbackTolerance: 3,
    group: {
      name: 'categories',
      put: ['apps'],
      pull: false
    },
    ghostClass: 'category-ghost',
    chosenClass: 'category-chosen',
    dragClass: 'category-drag',
    fallbackClass: 'category-fallback',
    delay: 50,
    filter: '.empty-categories',
    onMove: (evt) => {
      // 移除上一个高亮
      if (lastHighlightedElement) {
        lastHighlightedElement.classList.remove('drop-target')
      }

      // 检测鼠标移动到哪个分类上
      const related = evt.related
      if (related && related.classList.contains('category-item')) {
        const categoryId = related.getAttribute('data-category-id')
        // 保存目标分类 ID
        targetCategoryId = categoryId
        // 添加高亮效果
        related.classList.add('drop-target')
        lastHighlightedElement = related as HTMLElement
        return true
      }
      return false
    },
    onEnd: (evt) => {
      // 如果是分类内部排序（不是跨组拖拽）
      if (evt.from === evt.to && !evt.item.hasAttribute('data-app-id')) {
        const oldIndex = evt.oldIndex
        const newIndex = evt.newIndex

        if (oldIndex !== undefined && newIndex !== undefined && oldIndex !== newIndex) {
          appStore.reorderCategories(oldIndex, newIndex)
        }

        // 清除高亮和状态
        if (lastHighlightedElement) {
          lastHighlightedElement.classList.remove('drop-target')
          lastHighlightedElement = null
        }
        targetCategoryId = null
      }
    },
    onAdd: async (evt) => {
      // 应用被拖入分类
      const appElement = evt.item
      const appId = appElement.getAttribute('data-app-id')

      // 尝试多种方法获取目标分类
      let foundCategoryId: string | null = targetCategoryId

      // 备用方法1: 从拖拽位置的前一个元素获取
      if (!foundCategoryId && evt.newIndex !== undefined && evt.newIndex > 0) {
        const prevElement = evt.to.children[evt.newIndex - 1]
        if (prevElement && prevElement.classList.contains('category-item')) {
          foundCategoryId = prevElement.getAttribute('data-category-id')
        }
      }

      // 备用方法2: 从拖拽位置的后一个元素获取
      if (!foundCategoryId && evt.newIndex !== undefined) {
        const nextElement = evt.to.children[evt.newIndex + 1]
        if (nextElement && nextElement.classList.contains('category-item')) {
          foundCategoryId = nextElement.getAttribute('data-category-id')
        }
      }

      // 备用方法3: 从第一个分类获取（兜底）
      if (!foundCategoryId) {
        const firstCategory = evt.to.querySelector('.category-item')
        if (firstCategory) {
          foundCategoryId = firstCategory.getAttribute('data-category-id')
        }
      }

      if (appId && foundCategoryId) {
        await appStore.moveAppToCategory(appId, foundCategoryId)
        await appStore.selectCategory(foundCategoryId)
      }

      // 清除高亮和状态
      if (lastHighlightedElement) {
        lastHighlightedElement.classList.remove('drop-target')
        lastHighlightedElement = null
      }
      targetCategoryId = null

      // 移除被拖入的元素
      evt.item.remove()
    }
  })
}

onMounted(() => {
  document.addEventListener('click', hideContextMenu)
  document.addEventListener('click', hideSceneContextMenu)
  initScenes()
  nextTick(() => {
    initSortable()
  })
})

onUnmounted(() => {
  document.removeEventListener('click', hideContextMenu)
  document.removeEventListener('click', hideSceneContextMenu)
  if (sortableInstance.value) {
    sortableInstance.value.destroy()
  }
})
</script>

<style scoped>
.category-list {
  width: 260px;
  height: 100%;
  background: var(--bg-secondary-transparent);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
}

.sidebar-tabs {
  display: flex;
  padding: 8px;
  gap: 4px;
  border-bottom: 1px solid var(--border-color);
}

.tab-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  background: transparent;
  transition: all 0.2s;
}

.tab-btn:hover {
  background: var(--category-hover);
  color: var(--text-primary);
}

.tab-btn.active {
  background: var(--primary-color);
  color: white;
}

.category-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 16px;
  border-bottom: 1px solid var(--border-color);
}

.category-header h2 {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
}

.add-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--btn-primary);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
  box-shadow: var(--shadow-sm);
}

.add-btn:hover {
  background: var(--btn-primary-hover);
  box-shadow: var(--shadow-colored);
  transform: translateY(-2px);
}

.categories {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.category-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: 4px;
  user-select: none;
  border: 2px solid transparent;
}

.category-item:hover {
  background: var(--category-hover);
}

.category-item.active {
  background: var(--category-active);
  color: var(--primary-color);
  font-weight: 500;
}

/* 分类拖拽样式 */
.category-ghost {
  opacity: 0.4;
  background: rgba(59, 130, 246, 0.15) !important;
  border: 2px dashed var(--primary-color) !important;
}

.category-chosen {
  cursor: grabbing !important;
  transform: scale(1.03);
  background: rgba(59, 130, 246, 0.1) !important;
  border: 2px solid var(--primary-color) !important;
  transition: all 0.15s ease;
}

.category-drag {
  opacity: 0.9;
  cursor: grabbing !important;
  background: rgba(59, 130, 246, 0.12) !important;
}

.category-fallback {
  opacity: 1 !important;
  transform: scale(1.08) translateX(10px) !important;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3) !important;
  cursor: grabbing !important;
  z-index: 9999 !important;
  background: var(--sidebar-bg) !important;
  border-radius: 8px !important;
  border: 2px solid var(--primary-color) !important;
  transition: none !important;
}

/* 当应用拖拽悬停在分类上时的高亮效果 */
.category-item.drop-target {
  background: rgba(59, 130, 246, 0.2) !important;
  border-color: var(--primary-color) !important;
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
}

.category-icon {
  display: flex;
  align-items: center;
  color: inherit;
}

.category-name {
  flex: 1;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-count {
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--badge-bg);
  padding: 2px 8px;
  border-radius: 10px;
  min-width: 24px;
  text-align: center;
}

.empty-categories {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  gap: 12px;
  color: var(--text-secondary);
}

.empty-categories p {
  font-size: 14px;
}

.btn-add-first {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: var(--btn-primary);
  color: white;
  border-radius: 8px;
  font-size: 13px;
  transition: all 0.3s ease;
  box-shadow: var(--shadow-sm);
}

.btn-add-first:hover {
  background: var(--btn-primary-hover);
  box-shadow: var(--shadow-colored);
  transform: translateY(-2px);
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
  min-width: 140px;
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

/* ============ 场景面板样式 ============ */
.scenes-section {
  padding: 12px 8px 8px 8px;
  border-top: 1px solid var(--border-color);
}

.scenes-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px;
  margin-bottom: 8px;
}

.scenes-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.add-btn.small {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: var(--btn-primary);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.add-btn.small:hover {
  background: var(--btn-primary-hover);
  transform: scale(1.1);
}

.scenes-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.scene-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  user-select: none;
  background: var(--bg-primary);
}

.scene-item:hover {
  background: var(--category-hover);
  transform: translateX(2px);
}

.scene-item.executing {
  background: var(--primary-color);
  color: white;
  cursor: not-allowed;
}

.scene-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.scene-name {
  flex: 1;
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.scene-actions-count {
  font-size: 11px;
  color: var(--text-secondary);
  background: var(--badge-bg);
  padding: 2px 6px;
  border-radius: 8px;
  min-width: 20px;
  text-align: center;
}

.scene-item.executing .scene-actions-count {
  display: none;
}

.scene-progress {
  font-size: 11px;
  font-weight: 600;
  color: white;
}

.empty-scenes {
  padding: 20px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 12px;
}

.settings-footer {
  padding: 8px;
  border-top: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.settings-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  transition: all 0.2s;
}

.settings-btn:hover {
  background: var(--category-hover);
  color: var(--text-primary);
}

.maintenance-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  transition: all 0.2s;
}

.maintenance-btn:hover {
  background: var(--category-hover);
  color: var(--text-primary);
}

.footer-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.github-link {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  color: var(--text-secondary);
  transition: all 0.2s;
}

.github-link:hover {
  background: var(--category-hover);
  color: var(--text-primary);
}

.version-text {
  font-size: 11px;
  color: var(--text-secondary);
  opacity: 0.7;
}
</style>
