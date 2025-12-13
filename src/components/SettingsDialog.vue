<template>
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

          <!-- 背景图片 -->
          <div class="setting-item">
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
                按下 <kbd>{{ settings.globalShortcut || 'Alt+Space' }}</kbd> 快速显示/隐藏窗口，无论当前在哪个应用中
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
                按下 <kbd>{{ settings.spotlightShortcut || 'Ctrl+K' }}</kbd> 打开 Spotlight 风格搜索框，快速搜索应用、剪贴板和网页
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
                按下 <kbd>{{ settings.quickNotesShortcut || 'Alt+N' }}</kbd> 快速打开便签，记录临时内容，自动保存
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
                <kbd>Alt+Space</kbd>
                <span>显示/隐藏窗口</span>
              </div>
              <div class="tip-row">
                <kbd>Ctrl+K</kbd>
                <span>打开快捷搜索</span>
              </div>
              <div class="tip-row">
                <kbd>Alt+N</kbd>
                <span>打开快捷便签</span>
              </div>
              <div class="tip-row">
                <kbd>=表达式</kbd>
                <span>在搜索框中计算</span>
              </div>
            </div>
          </div>
        </section>

        <!-- 关于 -->
        <section class="settings-section">
          <div class="section-header">
            <h3>关于</h3>
          </div>
          <div class="about-info">
            <p><strong>程序管理器</strong> v1.1.0</p>
            <p class="about-desc">一个现代化的 Windows 程序管理工具</p>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { open } from '@tauri-apps/plugin-dialog'
import { readFile } from '@tauri-apps/plugin-fs'
import { XIcon, KeyboardIcon, ClipboardListIcon, SearchIcon, StickyNoteIcon, CalculatorIcon } from 'lucide-vue-next'
import { useAppStore } from '@/stores/appStore'
import { DEFAULT_THEME_COLORS } from '@/types'

defineEmits(['close'])

const appStore = useAppStore()
const settings = computed(() => appStore.settings)

// 预设主题色
const themeColors = DEFAULT_THEME_COLORS

// 更新主题色
const updateThemeColor = async (color: string) => {
  await appStore.updateSettings({ themeColor: color })
  // 应用主题色到 CSS 变量
  document.documentElement.style.setProperty('--primary-color', color)
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
  await appStore.updateSettings({ quickerEnabled: checked })
}

const toggleGlobalShortcut = async (event: Event) => {
  const checked = (event.target as HTMLInputElement).checked
  await appStore.updateSettings({ globalShortcutEnabled: checked })
}

const toggleClipboardHistory = async (event: Event) => {
  const checked = (event.target as HTMLInputElement).checked
  await appStore.updateSettings({ clipboardHistoryEnabled: checked })
}

const toggleSpotlightSearch = async (event: Event) => {
  const checked = (event.target as HTMLInputElement).checked
  await appStore.updateSettings({ spotlightSearchEnabled: checked })
}

const toggleQuickNotes = async (event: Event) => {
  const checked = (event.target as HTMLInputElement).checked
  await appStore.updateSettings({ quickNotesEnabled: checked })
}

const toggleCalculator = async (event: Event) => {
  const checked = (event.target as HTMLInputElement).checked
  await appStore.updateSettings({ calculatorEnabled: checked })
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
</style>
