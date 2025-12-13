import { defineStore } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import { useAppStore } from './appStore'
import type { Scene, SceneAction } from '@/types'

const STORAGE_KEY = 'app_scenes_config'

export const useScenesStore = defineStore('scenes', {
  state: () => ({
    scenes: [] as Scene[],
    initialized: false,
    executing: false,
    currentExecutingScene: null as string | null,
    executionProgress: 0
  }),

  getters: {
    // 获取所有场景
    allScenes(): Scene[] {
      return this.scenes
    },

    // 根据 ID 获取场景
    getSceneById(): (id: string) => Scene | undefined {
      return (id: string) => this.scenes.find(s => s.id === id)
    }
  },

  actions: {
    // 初始化 - 从 localStorage 加载配置
    init() {
      if (this.initialized) return

      try {
        const saved = localStorage.getItem(STORAGE_KEY)
        if (saved) {
          const config = JSON.parse(saved)
          this.scenes = config.scenes || []
        }
      } catch (error) {
        console.error('加载场景配置失败:', error)
      }

      this.initialized = true
    },

    // 保存配置到 localStorage
    saveConfig() {
      const config = {
        scenes: this.scenes
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
    },

    // 添加场景
    addScene(scene: Omit<Scene, 'id' | 'createdAt' | 'updatedAt'>) {
      const newScene: Scene = {
        ...scene,
        id: `scene_${Date.now()}`,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
      this.scenes.push(newScene)
      this.saveConfig()
      return newScene
    },

    // 更新场景
    updateScene(id: string, updates: Partial<Omit<Scene, 'id' | 'createdAt'>>) {
      const index = this.scenes.findIndex(s => s.id === id)
      if (index >= 0) {
        this.scenes[index] = {
          ...this.scenes[index],
          ...updates,
          updatedAt: Date.now()
        }
        this.saveConfig()
        return this.scenes[index]
      }
      return null
    },

    // 删除场景
    deleteScene(id: string) {
      const index = this.scenes.findIndex(s => s.id === id)
      if (index >= 0) {
        this.scenes.splice(index, 1)
        this.saveConfig()
        return true
      }
      return false
    },

    // 执行单个动作
    async executeAction(action: SceneAction): Promise<{ success: boolean; error?: string }> {
      const appStore = useAppStore()

      try {
        switch (action.type) {
          case 'launch': {
            if (!action.params.appId) {
              return { success: false, error: '未指定应用' }
            }
            const app = appStore.config.apps[action.params.appId]
            if (!app) {
              return { success: false, error: '应用不存在' }
            }
            await appStore.launchApp(action.params.appId)
            return { success: true }
          }

          case 'launch_admin': {
            if (!action.params.appId) {
              return { success: false, error: '未指定应用' }
            }
            const app = appStore.config.apps[action.params.appId]
            if (!app) {
              return { success: false, error: '应用不存在' }
            }
            await invoke('execute_action_template', {
              scriptContent: 'Start-Process -FilePath $env:APP_PATH -Verb RunAs',
              appPath: app.path,
              appName: app.name
            })
            return { success: true }
          }

          case 'open_url': {
            if (!action.params.url) {
              return { success: false, error: '未指定网址' }
            }
            await invoke('execute_action_template', {
              scriptContent: `Start-Process "${action.params.url}"`,
              appPath: '',
              appName: ''
            })
            return { success: true }
          }

          case 'open_folder': {
            if (!action.params.path) {
              return { success: false, error: '未指定文件夹路径' }
            }
            await invoke('execute_action_template', {
              scriptContent: `Start-Process explorer "${action.params.path}"`,
              appPath: '',
              appName: ''
            })
            return { success: true }
          }

          case 'open_file': {
            if (!action.params.path) {
              return { success: false, error: '未指定文件路径' }
            }
            await invoke('execute_action_template', {
              scriptContent: `Start-Process "${action.params.path}"`,
              appPath: '',
              appName: ''
            })
            return { success: true }
          }

          case 'close_app': {
            if (!action.params.appId && !action.params.processName) {
              return { success: false, error: '未指定要关闭的程序' }
            }

            let processName = action.params.processName
            if (!processName && action.params.appId) {
              const app = appStore.config.apps[action.params.appId]
              if (app) {
                // 从路径提取进程名
                processName = app.path.split('\\').pop()?.replace('.exe', '') || ''
              }
            }

            if (!processName) {
              return { success: false, error: '无法确定进程名' }
            }

            await invoke('execute_action_template', {
              scriptContent: `$ps = Get-Process -Name "${processName}" -ErrorAction SilentlyContinue
if ($ps) { $ps | Stop-Process -Force }`,
              appPath: '',
              appName: ''
            })
            return { success: true }
          }

          case 'delay': {
            const seconds = action.params.seconds || 1
            await new Promise(resolve => setTimeout(resolve, seconds * 1000))
            return { success: true }
          }

          case 'notify': {
            const message = action.params.message || '场景执行完成'
            // 使用 PowerShell 发送 Windows Toast 通知
            try {
              await invoke('execute_action_template', {
                scriptContent: `
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
$template = @"
<toast>
  <visual>
    <binding template="ToastText02">
      <text id="1">程序管理器</text>
      <text id="2">${message}</text>
    </binding>
  </visual>
</toast>
"@
$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml($template)
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("程序管理器").Show($toast)
`,
                appPath: '',
                appName: ''
              })
            } catch {
              console.log('通知:', message)
            }
            return { success: true }
          }

          default:
            return { success: false, error: '未知的动作类型' }
        }
      } catch (error) {
        return { success: false, error: String(error) }
      }
    },

    // 执行场景（顺序执行所有动作）
    async executeScene(sceneId: string): Promise<{
      success: boolean
      completedActions: number
      totalActions: number
      error?: string
    }> {
      const scene = this.scenes.find(s => s.id === sceneId)
      if (!scene) {
        return { success: false, completedActions: 0, totalActions: 0, error: '场景不存在' }
      }

      if (scene.actions.length === 0) {
        return { success: true, completedActions: 0, totalActions: 0 }
      }

      this.executing = true
      this.currentExecutingScene = sceneId
      this.executionProgress = 0

      let completedActions = 0
      const totalActions = scene.actions.length

      try {
        for (let i = 0; i < scene.actions.length; i++) {
          const action = scene.actions[i]
          const result = await this.executeAction(action)

          if (!result.success) {
            // 动作执行失败，继续执行下一个（不中断）
            console.warn(`动作执行失败: ${result.error}`)
          } else {
            completedActions++
          }

          // 更新进度
          this.executionProgress = Math.round(((i + 1) / totalActions) * 100)
        }

        return {
          success: true,
          completedActions,
          totalActions
        }
      } catch (error) {
        return {
          success: false,
          completedActions,
          totalActions,
          error: String(error)
        }
      } finally {
        this.executing = false
        this.currentExecutingScene = null
        this.executionProgress = 0
      }
    },

    // 重新排序动作
    reorderActions(sceneId: string, fromIndex: number, toIndex: number) {
      const scene = this.scenes.find(s => s.id === sceneId)
      if (!scene) return

      const [removed] = scene.actions.splice(fromIndex, 1)
      scene.actions.splice(toIndex, 0, removed)
      scene.updatedAt = Date.now()
      this.saveConfig()
    },

    // 添加动作到场景
    addActionToScene(sceneId: string, action: Omit<SceneAction, 'id'>) {
      const scene = this.scenes.find(s => s.id === sceneId)
      if (!scene) return null

      const newAction: SceneAction = {
        ...action,
        id: `action_${Date.now()}`
      }
      scene.actions.push(newAction)
      scene.updatedAt = Date.now()
      this.saveConfig()
      return newAction
    },

    // 从场景删除动作
    removeActionFromScene(sceneId: string, actionId: string) {
      const scene = this.scenes.find(s => s.id === sceneId)
      if (!scene) return false

      const index = scene.actions.findIndex(a => a.id === actionId)
      if (index >= 0) {
        scene.actions.splice(index, 1)
        scene.updatedAt = Date.now()
        this.saveConfig()
        return true
      }
      return false
    },

    // 更新场景中的动作
    updateActionInScene(sceneId: string, actionId: string, updates: Partial<Omit<SceneAction, 'id'>>) {
      const scene = this.scenes.find(s => s.id === sceneId)
      if (!scene) return null

      const action = scene.actions.find(a => a.id === actionId)
      if (action) {
        Object.assign(action, updates)
        scene.updatedAt = Date.now()
        this.saveConfig()
        return action
      }
      return null
    }
  }
})
