import { defineStore } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import { useAppStore } from './appStore'
import { useActionsStore } from './actionsStore'
import type { Scene, SceneAction, SceneActionExecutionLog, SceneFailureStrategy } from '@/types'
import { canUseProcessActions } from '@/types'
import { getSceneActionName } from '@/services/sceneActionRegistry'
import { sceneService } from '@/services/sceneService'
import { ask } from '@tauri-apps/plugin-dialog'

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
    async executeLaunchOptions(action: SceneAction, processName: string, confirmed = false): Promise<{ success: boolean; error?: string }> {
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
        const activated = await invoke<boolean>('activate_process_window', { processName })
        if (!activated) {
          return { success: false, error: '无法激活程序窗口' }
        }
        // 发送按键
        await invoke('send_keys', { keys: action.params.sendKeys, confirmed })
      }

      // 启动后延迟
      if (action.params.delayAfter && action.params.delayAfter > 0) {
        await new Promise(resolve => setTimeout(resolve, action.params.delayAfter! * 1000))
      }

      return { success: true }
    },

    // 执行单个动作
    async executeAction(action: SceneAction): Promise<{
      success: boolean
      error?: string
      output?: string
      exitCode?: number
      target?: string
      confirmed?: boolean
      skipped?: boolean
      cancelled?: boolean
    }> {
      const appStore = useAppStore()

      try {
        if (action.disabled) {
          return {
            success: true,
            skipped: true,
            confirmed: false,
            target: action.legacyType || action.type,
            output: action.disabledReason || '动作已禁用'
          }
        }

        const needsConfirmation = action.type === 'launch_admin' || action.type === 'close_app' ||
          (action.type === 'launch' && Boolean(action.params.sendKeys))
        let confirmed = false
        if (needsConfirmation) {
          const target = action.params.appId
            ? (appStore.config.apps[action.params.appId]?.name || action.params.appId)
            : (action.params.processName || '目标程序')
          const title = action.type === 'launch_admin' ? '确认管理员启动' :
            action.type === 'close_app' ? '确认结束进程' : '确认发送按键'
          const message = action.type === 'launch_admin'
            ? `场景将请求以管理员权限启动“${target}”，是否继续？`
            : action.type === 'close_app'
              ? `场景将强制结束“${target}”的全部进程，是否继续？`
              : `场景将向“${target}”窗口发送预设按键，是否继续？`
          confirmed = await ask(message, { title, kind: 'warning', okLabel: '继续', cancelLabel: '取消' })
          if (!confirmed) {
            return { success: false, error: '用户取消高风险动作', cancelled: true, confirmed: false, target }
          }
        }

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
                  await this.executeLaunchOptions(action, processName, confirmed)
                }
                return { success: true, skipped: true, confirmed, target: app.name, output: '进程已运行，已跳过', exitCode: 0 }
              }
            }
            await appStore.launchApp(action.params.appId)
            // 执行附属操作
            if (processName && (action.params.waitWindow || action.params.sendKeys)) {
              const result = await this.executeLaunchOptions(action, processName, confirmed)
              if (!result.success) {
                return result
              }
            }
            return { success: true, confirmed, target: app.name, output: '已启动程序', exitCode: 0 }
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
                  await this.executeLaunchOptions(action, processName, confirmed)
                }
                return { success: true, skipped: true, confirmed, target: app.name, output: '进程已运行，已跳过', exitCode: 0 }
              }
            }
            await invoke('launch_app_as_admin', { appPath: app.path, confirmed })
            // 执行附属操作
            if (processName && (action.params.waitWindow || action.params.sendKeys)) {
              const result = await this.executeLaunchOptions(action, processName, confirmed)
              if (!result.success) {
                return result
              }
            }
            return { success: true, confirmed, target: app.name, output: '已请求管理员启动', exitCode: 0 }
          }

          case 'open_url': {
            if (!action.params.url) {
              return { success: false, error: '未指定网址' }
            }
            await invoke('open_url', { url: action.params.url })
            return { success: true, target: action.params.url, output: '已打开网址', exitCode: 0 }
          }

          case 'open_folder': {
            if (!action.params.path) {
              return { success: false, error: '未指定文件夹路径' }
            }
            await invoke('open_folder', { path: action.params.path })
            return { success: true, target: action.params.path, output: '已打开文件夹', exitCode: 0 }
          }

          case 'open_file': {
            if (!action.params.path) {
              return { success: false, error: '未指定文件路径' }
            }
            await invoke('open_file', { path: action.params.path })
            return { success: true, target: action.params.path, output: '已打开文件', exitCode: 0 }
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
              return { success: true, skipped: true, confirmed, target: processName, output: '进程未运行，已跳过', exitCode: 0 }
            }

            const result = await invoke<{
              success: boolean
              output?: string
              errorOutput?: string
              exitCode?: number
            }>('close_process', { processName, confirmed })
            return {
              success: result.success,
              confirmed,
              target: processName,
              output: result?.output || '已请求结束进程',
              error: result.success ? undefined : (result.errorOutput || '结束进程失败'),
              exitCode: result?.exitCode ?? -1
            }
          }

          case 'delay': {
            const seconds = action.params.seconds || 1
            const completed = await this.waitForDelay(seconds)
            if (!completed) {
              return { success: false, cancelled: true, error: '用户取消执行' }
            }
            return { success: true, output: `已等待 ${seconds} 秒`, exitCode: 0 }
          }

          case 'notify': {
            const message = action.params.message || '场景执行完成'
            try {
              await invoke('show_notification', {
                title: '程序管理器',
                body: message
              })
            } catch (error) {
              console.log('通知:', message)
              return { success: false, error: String(error) }
            }
            return { success: true, target: message, output: '已发送通知', exitCode: 0 }
          }

          default:
            return { success: false, error: '未知的动作类型' }
        }
      } catch (error) {
        return { success: false, error: String(error), exitCode: -1 }
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

          const auditStore = useActionsStore()
          void auditStore.recordAudit({
            source: 'scene',
            actionId: action.id,
            actionType: action.type,
            target: result.target,
            status: result.cancelled ? 'cancelled' : result.skipped ? 'skipped' : result.success ? 'success' : 'failed',
            confirmed: result.confirmed === true,
            startedAt,
            endedAt,
            output: result.output,
            error: result.error,
            exitCode: result.exitCode
          })

          if (result.cancelled) {
            this.updateExecutionLog(action.id, {
              status: 'cancelled',
              endedAt,
              duration: endedAt - startedAt,
              error: result.error || '用户取消执行',
              target: result.target,
              output: result.output,
              exitCode: result.exitCode,
              confirmed: result.confirmed
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
              error: result.error || '动作执行失败',
              target: result.target,
              output: result.output,
              exitCode: result.exitCode,
              confirmed: result.confirmed
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
              message: result.skipped ? '已跳过：目标已满足' : '执行成功',
              target: result.target,
              output: result.output,
              exitCode: result.exitCode,
              confirmed: result.confirmed
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
