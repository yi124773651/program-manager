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
  </div>
</template>

<script setup lang="ts">
import { onMounted, computed, onUnmounted, watch } from 'vue'
import { useAppStore } from './stores/appStore'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { invoke } from '@tauri-apps/api/core'
import MainView from './views/MainView.vue'
import { listen } from '@tauri-apps/api/event'

const appStore = useAppStore()
const loading = computed(() => appStore.loading)
const settings = computed(() => appStore.settings)

let unlisten: (() => void) | null = null

// 应用主题色
const applyThemeColor = (color: string) => {
  document.documentElement.style.setProperty('--primary-color', color)
  // 计算 hover 颜色
  const rgb = hexToRgb(color)
  if (rgb) {
    const hoverColor = `rgb(${Math.max(rgb.r - 20, 0)}, ${Math.max(rgb.g - 20, 0)}, ${Math.max(rgb.b - 20, 0)})`
    document.documentElement.style.setProperty('--primary-hover', hoverColor)
  }
}

// 十六进制转 RGB
const hexToRgb = (hex: string) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null
}

// 监听窗口透明度变化
watch(() => settings.value.windowOpacity, async (opacity) => {
  if (opacity !== undefined) {
    try {
      const window = getCurrentWindow()
      // @ts-ignore - Tauri 2.0 API
      await window.setOpacity(opacity)
    } catch (error) {
      console.error('设置窗口透明度失败:', error)
    }
  }
}, { immediate: true })

// 监听主题色变化
watch(() => settings.value.themeColor, (color) => {
  if (color) {
    applyThemeColor(color)
  }
}, { immediate: true })

onMounted(async () => {
  await appStore.init()

  // 应用初始设置
  if (settings.value.themeColor) {
    applyThemeColor(settings.value.themeColor)
  }

  // 设置初始窗口透明度
  if (settings.value.windowOpacity !== undefined) {
    try {
      const window = getCurrentWindow()
      // @ts-ignore - Tauri 2.0 API
      await window.setOpacity(settings.value.windowOpacity)
    } catch (error) {
      console.error('设置初始窗口透明度失败:', error)
    }
  }

  // 监听从右键菜单添加文件的事件
  unlisten = await listen<string>('add-file-from-context-menu', async (event) => {
    const filePath = event.payload
    console.log('收到右键菜单添加文件事件:', filePath)

    try {
      const lowerPath = filePath.toLowerCase()

      // 检查是否是支持的文件类型
      if (!lowerPath.endsWith('.exe') && !lowerPath.endsWith('.lnk')) {
        alert('只能添加 .exe 或 .lnk 文件')
        return
      }

      // 确保有至少一个分类
      let targetCategoryId = appStore.currentCategory

      if (!targetCategoryId) {
        // 如果没有当前分类，检查是否有任何分类
        const categories = appStore.categories
        if (categories.length === 0) {
          // 创建一个默认分类
          const defaultCategory = await appStore.addCategory('我的应用')
          targetCategoryId = defaultCategory.id
          await appStore.selectCategory(targetCategoryId)
        } else {
          // 使用第一个分类
          targetCategoryId = categories[0].id
          await appStore.selectCategory(targetCategoryId)
        }
      }

      // 获取实际执行路径和应用名
      let execPath = filePath
      let appName = ''

      if (lowerPath.endsWith('.lnk')) {
        // 解析快捷方式
        try {
          execPath = await invoke<string>('resolve_shortcut', { lnkPath: filePath })
          const lnkName = filePath.split('\\').pop() || filePath.split('/').pop() || ''
          appName = lnkName.replace(/\.lnk$/i, '')
        } catch (error) {
          console.error('解析快捷方式失败:', error)
          alert(`解析快捷方式失败: ${error}`)
          return
        }
      } else {
        const fileName = filePath.split('\\').pop() || filePath.split('/').pop() || '未知应用'
        appName = fileName.replace(/\.exe$/i, '')
      }

      // 检查是否已存在
      if (appStore.isAppExists(execPath)) {
        alert(`应用已存在：${appName}`)
        return
      }

      // 添加应用
      await appStore.addApp({
        name: appName,
        path: execPath,
        category: targetCategoryId
      })

      console.log('应用添加成功:', appName)

      // 显示成功提示
      setTimeout(() => {
        alert(`已成功添加应用：${appName}`)
      }, 100)

    } catch (error) {
      console.error('添加应用失败:', error)
      alert(`添加应用失败: ${error}`)
    }
  })
})

onUnmounted(() => {
  if (unlisten) {
    unlisten()
  }
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
