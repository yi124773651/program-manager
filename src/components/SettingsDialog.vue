<template>
  <div class="settings-root">
  <div class="settings-overlay" @click.self="$emit('close')">
    <div class="settings-dialog">
      <div class="settings-header">
        <h2>设置</h2>
        <button class="close-btn" @click="$emit('close')">
          <XIcon :size="20" />
        </button>
      </div>

      <div class="settings-content">
        <!-- 外观设置 -->
        <section class="settings-section">
          <div class="section-header">
            <h3>外观设置</h3>
            <p class="section-description">自定义应用的外观和主题</p>
          </div>

          <!-- 界面风格 -->
          <div class="setting-item theme-preset-setting">
            <div class="setting-info">
              <div class="setting-label">界面风格</div>
              <div class="setting-desc">切换整体背景、玻璃层次和文字对比；不会自动覆盖主题色</div>
            </div>
            <div class="setting-control theme-preset-control">
              <div class="theme-preset-grid">
                <div
                  v-for="preset in themePresetOptions"
                  :key="preset.id"
                  class="theme-preset-card"
                  :class="{ active: selectedThemePreset === preset.id }"
                >
                  <button
                    type="button"
                    class="theme-preset-select"
                    @click="updateThemePreset(preset.id)"
                  >
                    <div>
                      <div class="theme-preset-title">{{ preset.name }}</div>
                      <div class="theme-preset-desc">{{ preset.description }}</div>
                    </div>
                    <div class="theme-preset-swatches" aria-hidden="true">
                      <span
                        v-for="swatch in preset.swatches"
                        :key="swatch"
                        class="theme-preset-swatch"
                        :style="{ background: swatch }"
                      ></span>
                    </div>
                  </button>
                  <button
                    type="button"
                    class="btn-secondary recommended-color-btn"
                    @click.stop="applyPresetRecommendedColor(preset.id)"
                  >
                    使用推荐主色
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- 主题色选择 -->
          <div class="setting-item">
            <div class="setting-info">
              <div class="setting-label">主题色</div>
              <div class="setting-desc">选择你喜欢的主题颜色</div>
            </div>
            <div class="setting-control">
              <div class="color-picker-wrapper">
                <div class="color-presets">
                  <button
                    v-for="color in themeColors"
                    :key="color"
                    class="color-preset"
                    :class="{ active: settings.themeColor === color }"
                    :style="{ background: color }"
                    @click="updateThemeColor(color)"
                  />
                </div>
                <input
                  type="color"
                  class="custom-color-picker"
                  :value="settings.themeColor || '#007AFF'"
                  @input="updateThemeColor(($event.target as HTMLInputElement).value)"
                />
              </div>
            </div>
          </div>

          <!-- 背景来源 -->
          <div class="setting-item">
            <div class="setting-info">
              <div class="setting-label">背景来源</div>
              <div class="setting-desc">选择背景图片的来源方式</div>
            </div>
            <div class="setting-control">
              <div class="source-toggle">
                <button
                  class="source-btn"
                  :class="{ active: (settings.backgroundSource || 'local') === 'local' }"
                  @click="updateBackgroundSource('local')"
                >
                  本地图片
                </button>
                <button
                  class="source-btn"
                  :class="{ active: settings.backgroundSource === 'api' }"
                  @click="updateBackgroundSource('api')"
                >
                  随机图床
                </button>
              </div>
            </div>
          </div>

          <!-- 本地图片设置 -->
          <div v-if="(settings.backgroundSource || 'local') === 'local'" class="setting-item">
            <div class="setting-info">
              <div class="setting-label">背景图片</div>
              <div class="setting-desc">
                {{ settings.backgroundImage ? '已设置背景图' : '未设置背景图' }}
              </div>
            </div>
            <div class="setting-control">
              <button
                class="btn-secondary"
                @click="selectBackgroundImage"
              >
                {{ settings.backgroundImage ? '更换' : '选择' }}
              </button>
              <button
                v-if="settings.backgroundImage"
                class="btn-danger-outline"
                @click="clearBackgroundImage"
              >
                清除
              </button>
            </div>
          </div>

          <!-- 随机图床设置 -->
          <div v-if="settings.backgroundSource === 'api'" class="setting-item">
            <div class="setting-info">
              <div class="setting-label">图床地址</div>
              <div class="setting-desc">
                输入随机图片 API 地址，每次启动自动刷新
              </div>
            </div>
            <div class="setting-control api-bg-control">
              <input
                type="text"
                class="api-url-input"
                placeholder="https://picsum.photos/1920/1080"
                :value="settings.backgroundApiUrl || ''"
                @change="updateBackgroundApiUrl(($event.target as HTMLInputElement).value)"
              />
              <button
                class="btn-secondary"
                :disabled="apiBackgroundLoading || !settings.backgroundApiUrl"
                @click="refreshApiBackground"
              >
                {{ apiBackgroundLoading ? '加载中...' : '刷新预览' }}
              </button>
            </div>
          </div>

          <!-- 背景透明度 -->
          <div class="setting-item">
            <div class="setting-info">
              <div class="setting-label">背景遮罩</div>
              <div class="setting-desc">
                遮罩强度 {{ Math.round((settings.backgroundOpacity || 0.3) * 100) }}%（数值越高背景越淡）
              </div>
            </div>
            <div class="setting-control slider-control">
              <input
                type="range"
                min="0"
                max="100"
                :value="(settings.backgroundOpacity || 0.3) * 100"
                @input="updateBackgroundOpacity(parseFloat(($event.target as HTMLInputElement).value) / 100)"
                class="opacity-slider"
              />
            </div>
          </div>

          <!-- 窗口透明度 -->
          <div class="setting-item">
            <div class="setting-info">
              <div class="setting-label">窗口透明度</div>
              <div class="setting-desc">
                {{ Math.round((settings.windowOpacity || 0.95) * 100) }}%
              </div>
            </div>
            <div class="setting-control slider-control">
              <input
                type="range"
                min="70"
                max="100"
                :value="(settings.windowOpacity || 0.95) * 100"
                @input="updateWindowOpacity(parseFloat(($event.target as HTMLInputElement).value) / 100)"
                class="opacity-slider"
              />
            </div>
          </div>
        </section>

        <!-- 效率工具设置 (Quicker) -->
        <section class="settings-section">
          <div class="section-header">
            <h3>效率工具</h3>
            <p class="section-description">类似 Quicker 的快捷功能，提升操作效率</p>
          </div>

          <!-- 总开关 -->
          <div class="setting-item feature-toggle">
            <div class="setting-info">
              <div class="setting-label">启用效率工具</div>
              <div class="setting-desc">关闭后将禁用所有下方的效率功能</div>
            </div>
            <div class="setting-control">
              <label class="toggle-switch">
                <input
                  type="checkbox"
                  :checked="settings.quickerEnabled !== false"
                  @change="toggleQuicker"
                />
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>

          <!-- 全局快捷键唤起 -->
          <div class="setting-item" :class="{ disabled: settings.quickerEnabled === false }">
            <div class="setting-info">
              <div class="setting-label">
                <KeyboardIcon :size="16" class="feature-icon" />
                全局快捷键唤起
              </div>
              <div class="setting-desc">
                按下 <kbd>{{ shortcutValue('globalShortcut') }}</kbd> 快速显示/隐藏窗口，无论当前在哪个应用中
              </div>
            </div>
            <div class="setting-control">
              <label class="toggle-switch">
                <input
                  type="checkbox"
                  :checked="settings.globalShortcutEnabled !== false"
                  :disabled="settings.quickerEnabled === false"
                  @change="toggleGlobalShortcut"
                />
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>

          <!-- 剪贴板历史 -->
          <div class="setting-item" :class="{ disabled: settings.quickerEnabled === false }">
            <div class="setting-info">
              <div class="setting-label">
                <ClipboardListIcon :size="16" class="feature-icon" />
                剪贴板历史
              </div>
              <div class="setting-desc">
                自动记录复制的内容，支持搜索、置顶和快速粘贴，最多保存 {{ settings.clipboardMaxItems || 100 }} 条记录
              </div>
            </div>
            <div class="setting-control">
              <label class="toggle-switch">
                <input
                  type="checkbox"
                  :checked="settings.clipboardHistoryEnabled !== false"
                  :disabled="settings.quickerEnabled === false"
                  @change="toggleClipboardHistory"
                />
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>

          <!-- 快捷搜索 -->
          <div class="setting-item" :class="{ disabled: settings.quickerEnabled === false }">
            <div class="setting-info">
              <div class="setting-label">
                <SearchIcon :size="16" class="feature-icon" />
                快捷搜索
              </div>
              <div class="setting-desc">
                按下 <kbd>{{ shortcutValue('spotlightShortcut') }}</kbd> 打开 Spotlight 风格搜索框，快速搜索应用、剪贴板和网页
              </div>
            </div>
            <div class="setting-control">
              <label class="toggle-switch">
                <input
                  type="checkbox"
                  :checked="settings.spotlightSearchEnabled !== false"
                  :disabled="settings.quickerEnabled === false"
                  @change="toggleSpotlightSearch"
                />
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>

          <!-- 快捷便签 -->
          <div class="setting-item" :class="{ disabled: settings.quickerEnabled === false }">
            <div class="setting-info">
              <div class="setting-label">
                <StickyNoteIcon :size="16" class="feature-icon" />
                快捷便签
              </div>
              <div class="setting-desc">
                按下 <kbd>{{ shortcutValue('quickNotesShortcut') }}</kbd> 快速打开便签，记录临时内容，自动保存
              </div>
            </div>
            <div class="setting-control">
              <label class="toggle-switch">
                <input
                  type="checkbox"
                  :checked="settings.quickNotesEnabled !== false"
                  :disabled="settings.quickerEnabled === false"
                  @change="toggleQuickNotes"
                />
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>

          <!-- 待办日程表 -->
          <div class="setting-item" :class="{ disabled: settings.quickerEnabled === false }">
            <div class="setting-info">
              <div class="setting-label">
                <CalendarDaysIcon :size="16" class="feature-icon" />
                待办日程表
              </div>
              <div class="setting-desc">
                按下 <kbd>{{ shortcutValue('todoShortcut') }}</kbd> 打开或隐藏独立待办窗口，支持开始/结束时间、任务说明和一键清理今天之前记录
              </div>
            </div>
            <div class="setting-control">
              <label class="toggle-switch">
                <input
                  type="checkbox"
                  :checked="settings.todoScheduleEnabled !== false"
                  :disabled="settings.quickerEnabled === false"
                  @change="toggleTodoSchedule"
                />
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>

          <!-- 快捷键配置 -->
          <div class="shortcut-panel" :class="{ disabled: settings.quickerEnabled === false }">
            <div class="shortcut-panel-header">
              <div>
                <div class="setting-label">
                  <KeyboardIcon :size="16" class="feature-icon" />
                  快捷键配置
                </div>
                <div class="setting-desc">
                  保存后立即重新注册；如果系统占用或格式无效，会保留旧设置
                </div>
              </div>
            </div>

            <div class="shortcut-grid">
              <div
                v-for="shortcut in shortcutControls"
                :key="shortcut.field"
                class="shortcut-row"
              >
                <div class="shortcut-info">
                  <span>{{ shortcut.label }}</span>
                  <kbd>{{ shortcutValue(shortcut.field) }}</kbd>
                </div>
                <div class="shortcut-editor">
                  <input
                    type="text"
                    class="shortcut-input"
                    :value="shortcutValue(shortcut.field)"
                    :disabled="settings.quickerEnabled === false || shortcutSaving === shortcut.field"
                    @change="saveShortcutFromInput($event, shortcut.field)"
                    @keydown.enter.prevent="saveShortcutFromInput($event, shortcut.field)"
                  />
                  <button
                    class="btn-secondary btn-compact"
                    :class="{ active: recordingShortcutField === shortcut.field }"
                    :disabled="settings.quickerEnabled === false || shortcutSaving === shortcut.field"
                    @click="startShortcutRecording(shortcut.field)"
                  >
                    {{ recordingShortcutField === shortcut.field ? '按键中' : '录制' }}
                  </button>
                  <button
                    class="btn-secondary btn-compact"
                    :disabled="settings.quickerEnabled === false || shortcutSaving === shortcut.field"
                    @click="restoreShortcutDefault(shortcut.field)"
                  >
                    默认
                  </button>
                </div>
                <div v-if="shortcutFieldError(shortcut.field)" class="shortcut-feedback error">
                  {{ shortcutFieldError(shortcut.field) }}
                </div>
              </div>
            </div>

            <div v-if="shortcutConflicts.length > 0" class="shortcut-feedback error">
              {{ shortcutConflicts.join('；') }}
            </div>
            <div v-if="shortcutSaveError" class="shortcut-feedback error">
              {{ shortcutSaveError }}
            </div>
            <div v-if="shortcutSaveMessage" class="shortcut-feedback success">
              {{ shortcutSaveMessage }}
            </div>
          </div>

          <!-- 计算器增强 -->
          <div class="setting-item" :class="{ disabled: settings.quickerEnabled === false }">
            <div class="setting-info">
              <div class="setting-label">
                <CalculatorIcon :size="16" class="feature-icon" />
                计算器增强
              </div>
              <div class="setting-desc">
                在搜索框中输入 <kbd>=表达式</kbd> 快速计算，如 <kbd>=1+2*3</kbd>，回车复制结果
              </div>
            </div>
            <div class="setting-control">
              <label class="toggle-switch">
                <input
                  type="checkbox"
                  :checked="settings.calculatorEnabled !== false"
                  :disabled="settings.quickerEnabled === false"
                  @change="toggleCalculator"
                />
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>

          <!-- 功能说明 -->
          <div class="feature-tips">
            <div class="tip-title">快捷键说明</div>
            <div class="tip-list">
              <div class="tip-row">
                <kbd>{{ shortcutValue('globalShortcut') }}</kbd>
                <span>显示/隐藏窗口</span>
              </div>
              <div class="tip-row">
                <kbd>{{ shortcutValue('spotlightShortcut') }}</kbd>
                <span>打开快捷搜索</span>
              </div>
              <div class="tip-row">
                <kbd>{{ shortcutValue('quickNotesShortcut') }}</kbd>
                <span>打开快捷便签</span>
              </div>
              <div class="tip-row">
                <kbd>{{ shortcutValue('todoShortcut') }}</kbd>
                <span>打开或隐藏待办日程表窗口</span>
              </div>
              <div class="tip-row">
                <kbd>=表达式</kbd>
                <span>在搜索框中计算</span>
              </div>
            </div>
          </div>
        </section>

        <!-- 维护工具 -->
        <section class="settings-section">
          <div class="section-header">
            <h3>维护工具</h3>
            <p class="section-description">检测失效项和程序更新</p>
          </div>
          <div class="setting-item">
            <div class="setting-info">
              <div class="setting-label">程序维护</div>
              <div class="setting-desc">批量检测程序有效性和更新</div>
            </div>
            <div class="setting-control">
              <button class="btn-primary" @click="showMaintenance = true">
                打开维护面板
              </button>
            </div>
          </div>
        </section>

        <!-- 数据导入导出 -->
        <section class="settings-section">
          <div class="section-header">
            <h3>数据导入导出</h3>
            <p class="section-description">导出完整本地数据包，或从数据包选择性覆盖导入</p>
          </div>
          <div class="setting-item">
            <div class="setting-info">
              <div class="setting-label">导出本地数据</div>
              <div class="setting-desc">包含主配置、场景、便签、待办、剪贴板、快捷动作和图标目录</div>
            </div>
            <div class="setting-control">
              <button class="btn-primary" :disabled="dataTransferBusy" @click="handleExportLocalData">
                导出数据包
              </button>
            </div>
          </div>

          <div class="setting-item import-setting">
            <div class="setting-info">
              <div class="setting-label">导入本地数据</div>
              <div class="setting-desc">选择导出目录中的 manifest.json，导入前会自动备份当前数据</div>
            </div>
            <div class="setting-control">
              <button class="btn-secondary" :disabled="dataTransferBusy" @click="handleSelectImportManifest">
                选择数据包
              </button>
            </div>
          </div>

          <div v-if="importPreview" class="import-preview">
            <div class="import-preview-header">
              <div>
                <div class="import-preview-title">导入预览</div>
                <div class="setting-desc">
                  版本 {{ importPreview.appVersion }}，导出于 {{ formatImportTime(importPreview.exportedAt) }}
                </div>
              </div>
              <button class="btn-primary" :disabled="!canImportSelected || dataTransferBusy" @click="handleImportLocalData">
                覆盖导入
              </button>
            </div>

            <div v-if="importPreview.errors.length > 0" class="data-transfer-feedback error">
              {{ importPreview.errors.join('；') }}
            </div>

            <div class="import-section-list">
              <label
                v-for="section in importPreview.sections"
                :key="section.section"
                class="import-section-row"
                :class="{ disabled: !section.available || !!section.error }"
              >
                <input
                  type="checkbox"
                  :checked="selectedImportSections.includes(section.section)"
                  :disabled="!section.available || !!section.error || dataTransferBusy"
                  @change="toggleImportSection(section.section, ($event.target as HTMLInputElement).checked)"
                />
                <span class="import-section-main">
                  <span class="import-section-label">{{ section.label }}</span>
                  <span class="import-section-desc">{{ importSectionText(section) }}</span>
                </span>
              </label>
            </div>
          </div>

          <div v-if="dataTransferMessage" class="data-transfer-feedback" :class="dataTransferStatus">
            {{ dataTransferMessage }}
          </div>
        </section>

        <!-- 关于 -->
        <section class="settings-section">
          <div class="section-header">
            <h3>关于</h3>
          </div>
          <div class="about-info">
            <p><strong>程序管理器</strong> v1.1.5</p>
            <p class="about-desc">一个现代化的 Windows 程序管理工具</p>
          </div>
        </section>
      </div>
    </div>
  </div>

    <!-- 维护面板 -->
    <MaintenancePanel v-if="showMaintenance" @close="showMaintenance = false" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ask, open } from '@tauri-apps/plugin-dialog'
import { readFile } from '@tauri-apps/plugin-fs'
import { XIcon, KeyboardIcon, ClipboardListIcon, SearchIcon, StickyNoteIcon, CalculatorIcon, CalendarDaysIcon } from 'lucide-vue-next'
import { useAppStore } from '@/stores/appStore'
import { useActionsStore } from '@/stores/actionsStore'
import { useClipboardStore } from '@/stores/clipboardStore'
import { useNotesStore } from '@/stores/notesStore'
import { useScenesStore } from '@/stores/scenesStore'
import { useTodoStore } from '@/stores/todoStore'
import { DEFAULT_THEME_COLORS, type AppSettings, type ThemePreset } from '@/types'
import { tauriAdapter, type LocalDataImportPreview, type LocalDataSection } from '@/adapters/tauriAdapter'
import {
  canImportLocalData,
  exportLocalDataWithPicker,
  importLocalDataWithConfirmation,
  importSectionText,
  previewLocalDataImportWithPicker,
  toggleImportSectionSelection
} from '@/services/localDataService'
import {
  DEFAULT_SHORTCUTS,
  SHORTCUT_DEFINITIONS,
  getActiveShortcutConflicts,
  getShortcutValue,
  normalizeShortcutText,
  shortcutFromKeyboardEvent,
  type ShortcutField
} from '@/services/shortcutService'
import MaintenancePanel from './MaintenancePanel.vue'
import { normalizeThemePreset, THEME_PRESET_META, THEME_PRESETS } from '@/services/themeService'

defineEmits(['close'])

const appStore = useAppStore()
const settings = computed(() => appStore.settings)

// 维护面板状态
const showMaintenance = ref(false)

// 图床加载状态
const apiBackgroundLoading = ref(false)

// 预设主题色
const themeColors = DEFAULT_THEME_COLORS
const themePresetOptions = THEME_PRESETS.map((preset) => THEME_PRESET_META[preset])
const selectedThemePreset = computed(() => normalizeThemePreset(settings.value.themePreset))
const shortcutControls = SHORTCUT_DEFINITIONS
const shortcutSaving = ref<ShortcutField | null>(null)
const recordingShortcutField = ref<ShortcutField | null>(null)
const shortcutSaveError = ref<string | null>(null)
const shortcutSaveMessage = ref<string | null>(null)
const shortcutErrors = ref<Partial<Record<ShortcutField, string>>>({})
const dataTransferBusy = ref(false)
const dataTransferMessage = ref('')
const dataTransferStatus = ref<'success' | 'error'>('success')
const importPreview = ref<LocalDataImportPreview | null>(null)
const selectedImportSections = ref<LocalDataSection[]>([])

const shortcutConflicts = computed(() => getActiveShortcutConflicts(settings.value))

const shortcutValue = (field: ShortcutField) => getShortcutValue(settings.value, field)

const shortcutFieldError = (field: ShortcutField) => shortcutErrors.value[field] || null
const canImportSelected = computed(() => {
  return canImportLocalData(importPreview.value, selectedImportSections.value)
})

const setShortcutError = (field: ShortcutField, message: string) => {
  shortcutErrors.value = {
    ...shortcutErrors.value,
    [field]: message
  }
  shortcutSaveMessage.value = null
}

const clearShortcutError = (field: ShortcutField) => {
  const nextErrors = { ...shortcutErrors.value }
  delete nextErrors[field]
  shortcutErrors.value = nextErrors
}

const saveShortcutSettings = async (
  patch: Partial<AppSettings>,
  errorField: ShortcutField,
  successMessage = '快捷键设置已保存'
) => {
  const nextSettings = { ...settings.value, ...patch }
  const conflicts = getActiveShortcutConflicts(nextSettings)

  if (conflicts.length > 0) {
    setShortcutError(errorField, conflicts.join('；'))
    return false
  }

  const previousSettings = { ...settings.value }
  shortcutSaving.value = errorField
  shortcutSaveError.value = null
  shortcutSaveMessage.value = null

  try {
    await appStore.updateSettings(patch, { immediate: true })
    clearShortcutError(errorField)
    shortcutSaveMessage.value = successMessage
    return true
  } catch (error) {
    Object.assign(appStore.config.settings, previousSettings)
    shortcutSaveError.value = `保存快捷键设置失败：${String(error)}`
    return false
  } finally {
    shortcutSaving.value = null
  }
}

const saveShortcutValue = async (field: ShortcutField, rawValue: string) => {
  const normalized = normalizeShortcutText(rawValue)

  if (!normalized.shortcut) {
    setShortcutError(field, normalized.error || '快捷键格式无效')
    return false
  }

  recordingShortcutField.value = null
  return saveShortcutSettings(
    { [field]: normalized.shortcut } as Partial<AppSettings>,
    field
  )
}

const saveShortcutFromInput = async (event: Event, field: ShortcutField) => {
  await saveShortcutValue(field, (event.target as HTMLInputElement).value)
}

const startShortcutRecording = (field: ShortcutField) => {
  recordingShortcutField.value = field
  clearShortcutError(field)
  shortcutSaveError.value = null
  shortcutSaveMessage.value = '请按下新的组合键'
}

const restoreShortcutDefault = async (field: ShortcutField) => {
  await saveShortcutValue(field, DEFAULT_SHORTCUTS[field])
}

const handleShortcutRecording = (event: KeyboardEvent) => {
  if (!recordingShortcutField.value) return

  const shortcut = shortcutFromKeyboardEvent(event, { metaAsCtrl: true })
  if (!shortcut) return

  event.preventDefault()
  event.stopPropagation()

  const field = recordingShortcutField.value
  void saveShortcutValue(field, shortcut)
}

onMounted(() => {
  window.addEventListener('keydown', handleShortcutRecording, true)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleShortcutRecording, true)
})

// 更新主题色
const updateThemeColor = async (color: string) => {
  await appStore.updateSettings({ themeColor: color })
}

// 切换界面风格只更新预设字段，保留用户当前自定义主题色。
const updateThemePreset = async (preset: ThemePreset) => {
  await appStore.updateSettings({ themePreset: preset })
}

const applyPresetRecommendedColor = async (preset: ThemePreset) => {
  await updateThemeColor(THEME_PRESET_META[preset].recommendedPrimaryColor)
}

// 选择背景图片
const selectBackgroundImage = async () => {
  try {
    const selected = await open({
      multiple: false,
      filters: [{
        name: 'Image',
        extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']
      }]
    })

    if (selected) {
      // 读取文件并转换为 base64
      const fileData = await readFile(selected as string)
      const base64 = btoa(
        new Uint8Array(fileData).reduce((data, byte) => data + String.fromCharCode(byte), '')
      )

      // 检测文件扩展名
      const extension = (selected as string).split('.').pop()?.toLowerCase() || 'png'
      const mimeType = extension === 'jpg' || extension === 'jpeg' ? 'jpeg' : extension

      const backgroundImage = `data:image/${mimeType};base64,${base64}`
      await appStore.updateSettings({ backgroundImage })
    }
  } catch (error) {
    console.error('选择背景图片失败:', error)
  }
}

// 清除背景图片
const clearBackgroundImage = async () => {
  await appStore.updateSettings({ backgroundImage: undefined })
}

// 切换背景来源
const updateBackgroundSource = async (source: 'local' | 'api') => {
  await appStore.updateSettings({ backgroundSource: source })
  if (source === 'api' && settings.value.backgroundApiUrl) {
    await refreshApiBackground()
  } else if (source === 'local') {
    // 切换到本地模式时，如果没有本地图片，清空背景
    // backgroundImage 保留上次的值即可
  }
}

// 更新图床 URL
const updateBackgroundApiUrl = async (url: string) => {
  await appStore.updateSettings({ backgroundApiUrl: url.trim() || undefined })
}

// 刷新图床背景
const refreshApiBackground = async () => {
  if (apiBackgroundLoading.value) return
  apiBackgroundLoading.value = true
  try {
    await appStore.loadApiBackground()
  } finally {
    apiBackgroundLoading.value = false
  }
}

// 更新背景透明度
const updateBackgroundOpacity = async (opacity: number) => {
  await appStore.updateSettings({ backgroundOpacity: opacity })
}

// 更新窗口透明度
const updateWindowOpacity = async (opacity: number) => {
  await appStore.updateSettings({ windowOpacity: opacity })
}

// 效率工具开关
const toggleQuicker = async (event: Event) => {
  const checked = (event.target as HTMLInputElement).checked
  await saveShortcutSettings({ quickerEnabled: checked }, 'globalShortcut')
}

const toggleGlobalShortcut = async (event: Event) => {
  const checked = (event.target as HTMLInputElement).checked
  await saveShortcutSettings({ globalShortcutEnabled: checked }, 'globalShortcut')
}

const toggleClipboardHistory = async (event: Event) => {
  const checked = (event.target as HTMLInputElement).checked
  await appStore.updateSettings({ clipboardHistoryEnabled: checked })
}

const toggleSpotlightSearch = async (event: Event) => {
  const checked = (event.target as HTMLInputElement).checked
  await saveShortcutSettings({ spotlightSearchEnabled: checked }, 'spotlightShortcut')
}

const toggleQuickNotes = async (event: Event) => {
  const checked = (event.target as HTMLInputElement).checked
  await saveShortcutSettings({ quickNotesEnabled: checked }, 'quickNotesShortcut')
}

const toggleTodoSchedule = async (event: Event) => {
  const checked = (event.target as HTMLInputElement).checked
  await saveShortcutSettings({ todoScheduleEnabled: checked }, 'todoShortcut')
}

const toggleCalculator = async (event: Event) => {
  const checked = (event.target as HTMLInputElement).checked
  await appStore.updateSettings({ calculatorEnabled: checked })
}

const showDataTransferStatus = (message: string, type: 'success' | 'error' = 'success') => {
  dataTransferMessage.value = message
  dataTransferStatus.value = type
}

const formatImportTime = (timestamp: number) => new Date(timestamp).toLocaleString('zh-CN', { hour12: false })

const toggleImportSection = (section: LocalDataSection, checked: boolean) => {
  selectedImportSections.value = toggleImportSectionSelection(
    selectedImportSections.value,
    section,
    checked
  )
}

const refreshImportedStores = async () => {
  await appStore.reloadConfig()
  await useScenesStore().loadFromStorage()
  await useNotesStore().loadFromStorage()
  await useTodoStore().loadFromStorage()
  await useClipboardStore().loadFromStorage()
  await useActionsStore().loadFromStorage()
}

const handleExportLocalData = async () => {
  dataTransferBusy.value = true
  dataTransferMessage.value = ''
  try {
    const flow = await exportLocalDataWithPicker({
      pickExportDir: () => open({
        directory: true,
        multiple: false,
        title: '选择数据包导出目录'
      }),
      exportLocalData: tauriAdapter.exportLocalData
    })
    if (flow.feedback) {
      showDataTransferStatus(flow.feedback.message, flow.feedback.status)
    }
  } finally {
    dataTransferBusy.value = false
  }
}

const handleSelectImportManifest = async () => {
  dataTransferBusy.value = true
  dataTransferMessage.value = ''
  try {
    const flow = await previewLocalDataImportWithPicker({
      pickManifest: () => open({
        multiple: false,
        title: '选择数据包 manifest.json',
        filters: [{ name: 'JSON', extensions: ['json'] }]
      }),
      previewLocalDataImport: tauriAdapter.previewLocalDataImport
    })
    if (!flow.completed) return

    importPreview.value = flow.preview
    selectedImportSections.value = flow.selectedSections
    if (flow.feedback) {
      showDataTransferStatus(flow.feedback.message, flow.feedback.status)
    }
  } finally {
    dataTransferBusy.value = false
  }
}

const handleImportLocalData = async () => {
  if (!importPreview.value || selectedImportSections.value.length === 0) return

  dataTransferBusy.value = true
  dataTransferMessage.value = ''
  try {
    const flow = await importLocalDataWithConfirmation(
      importPreview.value,
      selectedImportSections.value,
      {
        confirmImport: (message) => ask(message, {
          title: '确认覆盖导入',
          kind: 'warning',
          okLabel: '确认导入',
          cancelLabel: '取消'
        }),
        importLocalData: tauriAdapter.importLocalData,
        refreshImportedData: refreshImportedStores
      }
    )
    if (flow.feedback) {
      showDataTransferStatus(flow.feedback.message, flow.feedback.status)
    }
    if (flow.resetPreview) {
      importPreview.value = null
      selectedImportSections.value = []
    }
  } finally {
    dataTransferBusy.value = false
  }
}
</script>

<style scoped>
.settings-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}

.settings-dialog {
  width: 800px;
  max-width: 95vw;
  max-height: 85vh;
  background: var(--bg-primary);
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-color);
}

.settings-header h2 {
  font-size: 20px;
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

.settings-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.settings-section {
  margin-bottom: 32px;
}

.settings-section:last-child {
  margin-bottom: 0;
}

.section-header {
  margin-bottom: 16px;
}

.section-header h3 {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 4px 0;
}

.section-description {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0;
  line-height: 1.5;
}

.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: var(--bg-secondary);
  border-radius: 8px;
  border: 1px solid var(--border-color);
  margin-bottom: 12px;
  gap: 20px;
  min-height: 70px;
}

.setting-item:last-child {
  margin-bottom: 0;
}

.setting-info {
  flex: 1;
  min-width: 0;
}

.setting-label {
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 4px;
  white-space: nowrap;
}

.setting-desc {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.4;
}

.setting-control {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.slider-control {
  min-width: 240px;
  max-width: 300px;
}

/* 界面风格 */
.theme-preset-setting {
  align-items: flex-start;
}

.theme-preset-control {
  flex: 0 1 460px;
}

.theme-preset-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  width: 100%;
}

.theme-preset-card {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-primary);
  overflow: hidden;
  transition: border-color 0.2s, box-shadow 0.2s, transform 0.2s;
}

.theme-preset-card.active {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 2px rgba(0, 122, 255, 0.12);
}

.theme-preset-card:hover {
  transform: translateY(-1px);
}

.theme-preset-select {
  width: 100%;
  min-height: 118px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 12px;
  text-align: left;
  color: var(--text-primary);
}

.theme-preset-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 4px;
}

.theme-preset-desc {
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-secondary);
}

.theme-preset-swatches {
  display: flex;
  gap: 5px;
}

.theme-preset-swatch {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1px solid var(--border-color);
}

.recommended-color-btn {
  width: calc(100% - 16px);
  min-width: 0;
  justify-content: center;
  margin: 0 8px 8px;
  padding: 6px 8px;
  font-size: 12px;
}

/* 主题色选择器 */
.color-picker-wrapper {
  display: flex;
  align-items: center;
  gap: 12px;
}

.color-presets {
  display: flex;
  gap: 8px;
}

.color-preset {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 2px solid transparent;
  transition: all 0.2s;
  cursor: pointer;
  position: relative;
}

.color-preset:hover {
  transform: scale(1.1);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.color-preset.active {
  border-color: var(--text-primary);
  box-shadow: 0 0 0 2px var(--bg-primary);
}

.custom-color-picker {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 2px solid var(--border-color);
  cursor: pointer;
  overflow: hidden;
}

.custom-color-picker::-webkit-color-swatch-wrapper {
  padding: 0;
}

.custom-color-picker::-webkit-color-swatch {
  border: none;
  border-radius: 50%;
}

/* 透明度滑块 */
.opacity-slider {
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: linear-gradient(to right, transparent, var(--primary-color));
  outline: none;
  -webkit-appearance: none;
}

.opacity-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--primary-color);
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  transition: all 0.2s;
}

.opacity-slider::-webkit-slider-thumb:hover {
  transform: scale(1.2);
}

.opacity-slider::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--primary-color);
  cursor: pointer;
  border: none;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

/* 按钮样式 */
.btn-primary,
.btn-secondary,
.btn-danger,
.btn-danger-outline {
  padding: 8px 20px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
  min-width: 80px;
}

.btn-primary {
  background: var(--primary-color);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: var(--primary-hover);
}

.btn-secondary {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.btn-secondary:hover {
  background: var(--border-color);
}

.btn-danger {
  background: var(--danger-color);
  color: white;
}

.btn-danger:hover:not(:disabled) {
  background: #e53e3e;
}

.btn-danger-outline {
  background: transparent;
  color: var(--danger-color);
  border: 1px solid var(--danger-color);
  min-width: 60px;
}

.btn-danger-outline:hover {
  background: var(--danger-color);
  color: white;
}

/* 带图标的按钮 */
.btn-secondary {
  display: flex;
  align-items: center;
  gap: 6px;
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.about-info {
  padding: 16px;
  background: var(--bg-secondary);
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.about-info p {
  margin: 0 0 8px 0;
  font-size: 14px;
}

.about-info p:last-child {
  margin: 0;
}

.about-desc {
  color: var(--text-secondary);
  font-size: 13px !important;
}

.import-setting {
  margin-bottom: 0;
}

.import-preview {
  margin-top: 12px;
  padding: 16px 20px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
}

.import-preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}

.import-preview-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 4px;
}

.import-section-list {
  display: grid;
  gap: 8px;
}

.import-section-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
}

.import-section-row.disabled {
  opacity: 0.55;
}

.import-section-row input {
  width: 16px;
  height: 16px;
  accent-color: var(--primary-color);
}

.import-section-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.import-section-label {
  font-size: 13px;
  font-weight: 500;
}

.import-section-desc {
  color: var(--text-secondary);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.data-transfer-feedback {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.5;
}

.data-transfer-feedback.success {
  background: rgba(52, 199, 89, 0.12);
  color: var(--success-color, #34c759);
}

.data-transfer-feedback.error {
  background: rgba(255, 59, 48, 0.1);
  color: var(--danger-color);
}

/* 开关样式 */
.toggle-switch {
  position: relative;
  display: inline-block;
  width: 48px;
  height: 26px;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--border-color);
  transition: 0.3s;
  border-radius: 26px;
}

.toggle-slider:before {
  position: absolute;
  content: "";
  height: 20px;
  width: 20px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  transition: 0.3s;
  border-radius: 50%;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.toggle-switch input:checked + .toggle-slider {
  background-color: var(--primary-color);
}

.toggle-switch input:checked + .toggle-slider:before {
  transform: translateX(22px);
}

.toggle-switch input:disabled + .toggle-slider {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 禁用状态 */
.setting-item.disabled {
  opacity: 0.5;
  pointer-events: none;
}

.shortcut-panel.disabled {
  opacity: 0.5;
  pointer-events: none;
}

.setting-item.disabled .toggle-switch {
  pointer-events: auto;
}

/* 功能图标 */
.feature-icon {
  margin-right: 8px;
  vertical-align: middle;
  color: var(--primary-color);
}

.setting-label {
  display: flex;
  align-items: center;
}

/* 功能说明样式 */
.feature-tips {
  margin-top: 16px;
  padding: 16px;
  background: var(--bg-secondary);
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.shortcut-panel {
  margin-bottom: 12px;
  padding: 16px 20px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
}

.shortcut-panel-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.shortcut-grid {
  display: grid;
  gap: 10px;
}

.shortcut-row {
  display: grid;
  grid-template-columns: minmax(150px, 1fr) minmax(280px, auto);
  align-items: center;
  gap: 10px 16px;
}

.shortcut-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  color: var(--text-primary);
  font-size: 13px;
}

.shortcut-info kbd {
  flex-shrink: 0;
  min-width: 80px;
  padding: 3px 8px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 12px;
  text-align: center;
}

.shortcut-editor {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.shortcut-input {
  width: 130px;
  padding: 7px 10px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
}

.shortcut-input:focus {
  border-color: var(--primary-color);
}

.btn-compact {
  min-width: 56px;
  padding: 7px 10px;
  justify-content: center;
}

.btn-compact.active {
  background: var(--primary-color);
  color: white;
}

.shortcut-feedback {
  grid-column: 1 / -1;
  font-size: 12px;
  line-height: 1.5;
}

.shortcut-feedback.error {
  color: var(--danger-color);
}

.shortcut-feedback.success {
  color: var(--success-color, #34c759);
}

.tip-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 12px;
}

.tip-list {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.tip-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
}

.tip-row kbd {
  background: var(--bg-tertiary);
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-family: inherit;
  border: 1px solid var(--border-color);
  min-width: 80px;
  text-align: center;
}

.tip-row span {
  color: var(--text-secondary);
}

/* 设置项中的 kbd 样式 */
.setting-desc kbd {
  background: var(--bg-tertiary);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-family: inherit;
  border: 1px solid var(--border-color);
}

.feature-toggle {
  background: linear-gradient(135deg, var(--primary-color) 0%, var(--primary-hover) 100%);
  border-color: transparent;
}

.feature-toggle .setting-label,
.feature-toggle .setting-desc {
  color: white;
}

.feature-toggle .toggle-slider {
  background-color: rgba(255, 255, 255, 0.3);
}

.feature-toggle .toggle-switch input:checked + .toggle-slider {
  background-color: rgba(255, 255, 255, 0.9);
}

.feature-toggle .toggle-switch input:checked + .toggle-slider:before {
  background-color: var(--primary-color);
}

/* 背景来源切换 */
.source-toggle {
  display: flex;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--border-color);
}

.source-btn {
  padding: 6px 16px;
  font-size: 13px;
  font-weight: 500;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  transition: all 0.2s;
  border: none;
  cursor: pointer;
}

.source-btn:first-child {
  border-right: 1px solid var(--border-color);
}

.source-btn.active {
  background: var(--primary-color);
  color: white;
}

.source-btn:not(.active):hover {
  background: var(--border-color);
}

/* 图床 URL 输入 */
.api-bg-control {
  flex-direction: column;
  align-items: stretch;
  min-width: 300px;
}

.api-url-input {
  width: 100%;
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s;
  box-sizing: border-box;
}

.api-url-input:focus {
  border-color: var(--primary-color);
}

.api-url-input::placeholder {
  color: var(--text-secondary);
  opacity: 0.6;
}
</style>
