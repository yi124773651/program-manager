import { defineStore } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import { useAppStore } from './appStore'
import type { Scene, SceneAction, SceneActionExecutionLog, SceneFailureStrategy } from '@/types'
import { canUseProcessActions } from '@/types'
import { getSceneActionName } from '@/services/sceneActionRegistry'
import { sceneService } from '@/services/sceneService'

export const useScenesStore = defineStore('scenes', {
  state: () => ({
    scenes: [] as Scene[],
    initialized: false,
    executing: false,
    currentExecutingScene: null as string | null,
    latestExecutionScene: null as string | null,
    currentExecutingAction: null as string | null,
    executionProgress: 0,
    executionLogs: [] as SceneActionExecutionLog[],
    cancelRequested: false
  }),

  getters: {
    // 获取所有场景
    allScenes(): Scene[] {
      return this.scenes
    },

    // 根据 ID 获取场景
    getSceneById(): (id: string) => Scene | undefined {
      return (id: string) => this.scenes.find(s => s.id === id)
    },

    latestExecutionLogs(): SceneActionExecutionLog[] {
      return this.executionLogs
    }
  },

  actions: {
    // 初始化 - 从统一 JSON 文件加载，旧 localStorage 仅作为兜底来源
    async init() {
      if (this.initialized) return

      await this.loadFromStorage()
      this.initialized = true
    },

    async loadFromStorage() {
      try {
        this.scenes = await sceneService.loadScenes()
      } catch (error) {
        console.error('加载场景配置失败:', error)
      }
    },

    // 保存配置到统一 JSON 文件
    async saveConfig() {
      await sceneService.saveScenes(this.scenes)
    },

    // 添加场景
    addScene(scene: Omit<Scene, 'id' | 'createdAt' | 'updatedAt'>) {
      const newScene = sceneService.createScene(scene)
      this.scenes.push(newScene)
      void this.saveConfig()
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
        void this.saveConfig()
        return this.scenes[index]
      }
      return null
    },

    // 删除场景
    deleteScene(id: string) {
      const index = this.scenes.findIndex(s => s.id === id)
      if (index >= 0) {
        this.scenes.splice(index, 1)
        void this.saveConfig()
        return true
      }
      return false
    },

    duplicateScene(sceneId: string) {
      const source = this.scenes.find(s => s.id === sceneId)
      if (!source) return null

      const duplicated = sceneService.duplicateScene(source)

      this.scenes.push(duplicated)
      void this.saveConfig()
      return duplicated
    },

    exportSceneJson(sceneId: string) {
      const scene = this.scenes.find(s => s.id === sceneId)
      if (!scene) return null
      return sceneService.exportSceneJson(scene)
    },

    importSceneJson(rawJson: string) {
      const imported = sceneService.importSceneJson(rawJson)
      this.scenes.push(imported)
      void this.saveConfig()
      return imported
    },

    // 从应用路径提取进程名
    getProcessNameFromApp(appId: string): string | null {
      const appStore = useAppStore()
      const app = appStore.config.apps[appId]
      if (!app) return null
      if (!canUseProcessActions(app.itemType)) return null
      // 从路径提取进程名（不含.exe）
      const fileName = app.path.split('\\').pop() || app.path.split('/').pop() || ''
      return fileName.replace(/\.exe$/i, '')
    },

    // 执行启动后的附属操作（等待窗口、发送按键、延迟）
    async executeLaunchOptions(action: SceneAction, processName: string): Promise<{ success: boolean; error?: string }> {
      // 等待窗口出现
      if (action.params.waitWindow) {
        const timeout = action.params.waitTimeout || 30
        const found = await invoke<boolean>('wait_for_window', {
          title: processName,
          timeoutSecs: timeout
        })
        if (!found) {
          return { success: false, error: '等待窗口超时' }
        }
      }

      // 发送按键
      if (action.params.sendKeys) {
        // 先激活窗口
        await invoke('execute_action_template', {
          scriptContent: `
$process = Get-Process -Name "${processName}" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($process) {
  $hwnd = $process.MainWindowHandle
  if ($hwnd -ne [IntPtr]::Zero) {
    Add-Type @"
    using System;
    using System.Runtime.InteropServices;
    public class WindowHelper {
      [DllImport("user32.dll")]
      public static extern bool SetForegroundWindow(IntPtr hWnd);
    }
"@
    [WindowHelper]::SetForegroundWindow($hwnd)
    Start-Sleep -Milliseconds 200
  }
}`,
          appPath: '',
          appName: ''
        })
        // 发送按键
        await invoke('send_keys', { keys: action.params.sendKeys })
      }

      // 启动后延迟
      if (action.params.delayAfter && action.params.delayAfter > 0) {
        await new Promise(resolve => setTimeout(resolve, action.params.delayAfter! * 1000))
      }

      return { success: true }
    },

    // 执行单个动作
    async executeAction(action: SceneAction): Promise<{ success: boolean; error?: string; skipped?: boolean; cancelled?: boolean }> {
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
            // 智能启动：检查进程是否已运行
            const processName = this.getProcessNameFromApp(action.params.appId)
            if (processName) {
              const isRunning = await invoke<boolean>('is_process_running', { processName })
              if (isRunning) {
                // 已运行但有发送按键，则激活窗口并发送
                if (action.params.sendKeys) {
                  await this.executeLaunchOptions(action, processName)
                }
                return { success: true, skipped: true }
              }
            }
            await appStore.launchApp(action.params.appId)
            // 执行附属操作
            if (processName && (action.params.waitWindow || action.params.sendKeys)) {
              const result = await this.executeLaunchOptions(action, processName)
              if (!result.success) {
                return result
              }
            }
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
            // 智能启动：检查进程是否已运行
            const processName = this.getProcessNameFromApp(action.params.appId)
            if (processName) {
              const isRunning = await invoke<boolean>('is_process_running', { processName })
              if (isRunning) {
                // 已运行但有发送按键，则激活窗口并发送
                if (action.params.sendKeys) {
                  await this.executeLaunchOptions(action, processName)
                }
                return { success: true, skipped: true }
              }
            }
            await invoke('execute_action_template', {
              scriptContent: 'Start-Process -FilePath $env:APP_PATH -Verb RunAs',
              appPath: app.path,
              appName: app.name
            })
            // 执行附属操作
            if (processName && (action.params.waitWindow || action.params.sendKeys)) {
              const result = await this.executeLaunchOptions(action, processName)
              if (!result.success) {
                return result
              }
            }
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
              processName = this.getProcessNameFromApp(action.params.appId) || ''
            }

            if (!processName) {
              return { success: false, error: '无法确定进程名' }
            }

            // 智能关闭：检查进程是否正在运行
            const isRunning = await invoke<boolean>('is_process_running', { processName })
            if (!isRunning) {
              return { success: true, skipped: true }
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
            const completed = await this.waitForDelay(seconds)
            if (!completed) {
              return { success: false, cancelled: true, error: '用户取消执行' }
            }
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

    async waitForDelay(seconds: number) {
      const endAt = Date.now() + seconds * 1000
      while (Date.now() < endAt) {
        if (this.cancelRequested) return false
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      return true
    },

    cancelExecution() {
      if (!this.executing) return
      this.cancelRequested = true
    },

    updateExecutionLog(actionId: string, patch: Partial<SceneActionExecutionLog>) {
      const index = this.executionLogs.findIndex(log => log.actionId === actionId)
      if (index >= 0) {
        this.executionLogs[index] = {
          ...this.executionLogs[index],
          ...patch
        }
      }
    },

    // 执行场景（顺序执行所有动作）
    async executeScene(sceneId: string): Promise<{
      success: boolean
      completedActions: number
      totalActions: number
      cancelled?: boolean
      error?: string
    }> {
      const scene = this.scenes.find(s => s.id === sceneId)
      if (!scene) {
        return { success: false, completedActions: 0, totalActions: 0, error: '场景不存在' }
      }

      if (scene.actions.length === 0) {
        this.latestExecutionScene = sceneId
        this.executionLogs = []
        return { success: true, completedActions: 0, totalActions: 0 }
      }

      this.executing = true
      this.currentExecutingScene = sceneId
      this.latestExecutionScene = sceneId
      this.currentExecutingAction = null
      this.executionProgress = 0
      this.cancelRequested = false
      this.executionLogs = scene.actions.map((action) => ({
        actionId: action.id,
        actionType: action.type,
        status: 'pending'
      }))

      let completedActions = 0
      const totalActions = scene.actions.length
      const failureStrategy: SceneFailureStrategy = scene.failureStrategy || 'continue'

      try {
        for (let i = 0; i < scene.actions.length; i++) {
          if (this.cancelRequested) {
            for (const actionToCancel of scene.actions.slice(i)) {
              this.updateExecutionLog(actionToCancel.id, {
                status: 'cancelled',
                message: '执行已取消'
              })
            }
            return {
              success: false,
              completedActions,
              totalActions,
              cancelled: true,
              error: '用户取消执行'
            }
          }

          const action = scene.actions[i]
          const startedAt = Date.now()
          this.currentExecutingAction = action.id
          this.updateExecutionLog(action.id, {
            status: 'running',
            startedAt,
            message: `正在执行：${getSceneActionName(action.type)}`
          })

          const result = await this.executeAction(action)
          const endedAt = Date.now()

          if (result.cancelled) {
            this.updateExecutionLog(action.id, {
              status: 'cancelled',
              endedAt,
              duration: endedAt - startedAt,
              error: result.error || '用户取消执行'
            })
            for (const actionToCancel of scene.actions.slice(i + 1)) {
              this.updateExecutionLog(actionToCancel.id, {
                status: 'cancelled',
                message: '执行已取消'
              })
            }
            return {
              success: false,
              completedActions,
              totalActions,
              cancelled: true,
              error: result.error || '用户取消执行'
            }
          } else if (!result.success) {
            console.warn(`动作执行失败: ${result.error}`)
            this.updateExecutionLog(action.id, {
              status: 'failed',
              endedAt,
              duration: endedAt - startedAt,
              error: result.error || '动作执行失败'
            })

            if (failureStrategy === 'stop') {
              for (const actionToCancel of scene.actions.slice(i + 1)) {
                this.updateExecutionLog(actionToCancel.id, {
                  status: 'cancelled',
                  message: '因失败策略中断'
                })
              }
              return {
                success: false,
                completedActions,
                totalActions,
                error: result.error || '动作执行失败'
              }
            }
          } else {
            completedActions++
            this.updateExecutionLog(action.id, {
              status: result.skipped ? 'skipped' : 'success',
              endedAt,
              duration: endedAt - startedAt,
              message: result.skipped ? '已跳过：目标已满足' : '执行成功'
            })
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
        this.currentExecutingAction = null
        this.executionProgress = 0
        this.cancelRequested = false
      }
    },

    // 重新排序动作
    reorderActions(sceneId: string, fromIndex: number, toIndex: number) {
      const scene = this.scenes.find(s => s.id === sceneId)
      if (!scene) return

      const [removed] = scene.actions.splice(fromIndex, 1)
      scene.actions.splice(toIndex, 0, removed)
      scene.updatedAt = Date.now()
      void this.saveConfig()
    },

    // 添加动作到场景
    addActionToScene(sceneId: string, action: Omit<SceneAction, 'id'>) {
      const scene = this.scenes.find(s => s.id === sceneId)
      if (!scene) return null

      const newAction: SceneAction = {
        ...action,
        id: sceneService.createActionId()
      }
      scene.actions.push(newAction)
      scene.updatedAt = Date.now()
      void this.saveConfig()
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
        void this.saveConfig()
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
        void this.saveConfig()
        return action
      }
      return null
    }
  }
})
