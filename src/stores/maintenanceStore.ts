import { defineStore } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { useAppStore } from './appStore'
import type {
  ValidationResult,
  UpdateCheckResult,
  BatchOperationResult,
  MaintenanceLogEntry,
  MaintenanceOperation,
  MaintenanceProgressEvent
} from '@/types'
import { canCheckForUpdates } from '@/types'
import { configService } from '@/services/configService'

let maintenanceProgressUnlisten: UnlistenFn | null = null

const operationLabels: Record<MaintenanceOperation, string> = {
  validation: '失效检测',
  baseline: '基准初始化',
  update: '更新检测',
  delete: '批量删除'
}

function toPercent(completed: number, total: number): number {
  if (total <= 0) return 0
  return Math.min(100, Math.round((completed / total) * 100))
}

function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false })
}

export const useMaintenanceStore = defineStore('maintenance', {
  state: () => ({
    // 验证状态
    validating: false,
    validationResults: [] as ValidationResult[],
    validationProgress: 0,

    // 更新检测状态
    checkingUpdates: false,
    updateResults: [] as UpdateCheckResult[],
    updateCheckProgress: 0,

    // 批量操作状态
    batchOperating: false,
    batchProgress: 0,
    batchTotal: 0,

    // 进度事件与导出日志
    progressMessage: '',
    maintenanceLogs: [] as MaintenanceLogEntry[],

    // 过滤器
    showOnlyInvalid: false,
    showOnlyUpdates: false,
  }),

  getters: {
    // 失效的应用
    invalidApps(): ValidationResult[] {
      return this.validationResults.filter(r => !r.isValid)
    },

    // 失效应用数量
    invalidAppCount(): number {
      return this.invalidApps.length
    },

    // 有更新的应用
    appsWithUpdates(): UpdateCheckResult[] {
      return this.updateResults.filter(r => r.hasUpdate)
    },

    // 有更新的应用数量
    updateCount(): number {
      return this.appsWithUpdates.length
    },

    // 高可信度更新
    highConfidenceUpdates(): UpdateCheckResult[] {
      return this.appsWithUpdates.filter(r => r.confidence === 'high')
    },

    // 需要初始化基准的应用数量
    uninitializedCount(): number {
      const appStore = useAppStore()
      let count = 0
      for (const app of Object.values(appStore.config.apps)) {
        if (canCheckForUpdates(app.itemType) && !app.updateMetadata) {
          count++
        }
      }
      return count
    },

    latestOperationLogs(): MaintenanceLogEntry[] {
      return this.maintenanceLogs
    },
  },

  actions: {
    async setupProgressListener() {
      if (maintenanceProgressUnlisten) return

      maintenanceProgressUnlisten = await listen<MaintenanceProgressEvent>('maintenance-progress', (event) => {
        this.recordProgress(event.payload)
      })
    },

    clearOperationLogs(operation?: MaintenanceOperation) {
      if (!operation) {
        this.maintenanceLogs = []
        return
      }
      this.maintenanceLogs = this.maintenanceLogs.filter(log => log.operation !== operation)
    },

    recordProgress(event: MaintenanceProgressEvent) {
      const logEntry: MaintenanceLogEntry = {
        ...event,
        id: `${event.operation}_${event.appId || 'batch'}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        timestamp: Date.now()
      }
      this.maintenanceLogs.push(logEntry)
      this.progressMessage = `${operationLabels[event.operation]}：${event.appName || event.appId || ''} ${event.message || ''}`.trim()

      if (event.operation === 'validation') {
        this.validationProgress = toPercent(event.completed, event.total)
      } else if (event.operation === 'update') {
        this.updateCheckProgress = toPercent(event.completed, event.total)
      } else if (event.operation === 'baseline' || event.operation === 'delete') {
        this.batchProgress = event.completed
        this.batchTotal = event.total
        this.batchProgress = event.completed
      }
    },

    // 验证所有应用
    async validateAllApps() {
      await this.setupProgressListener()
      this.validating = true
      this.validationProgress = 0
      this.validationResults = []
      this.clearOperationLogs('validation')

      try {
        const results = await invoke<ValidationResult[]>('validate_all_apps')
        this.validationResults = results
        this.validationProgress = 100

        // 更新 appStore 中的验证状态
        const appStore = useAppStore()
        for (const result of results) {
          const app = appStore.config.apps[result.appId]
          if (app) {
            app.validationStatus = result.isValid ? 'valid' : 'invalid'
            app.lastValidatedAt = Date.now()
          }
        }
        await appStore.saveConfig()

        return results
      } catch (error) {
        console.error('验证失败:', error)
        throw error
      } finally {
        this.validating = false
      }
    },

    // 初始化所有应用的基准数据
    async initAllUpdateBaselines() {
      await this.setupProgressListener()
      const appStore = useAppStore()
      const appIds = Object.values(appStore.config.apps)
        .filter(app => canCheckForUpdates(app.itemType))
        .map(app => app.id)
      const total = appIds.length

      this.batchOperating = true
      this.batchProgress = 0
      this.batchTotal = total
      this.clearOperationLogs('baseline')

      try {
        const result = await invoke<BatchOperationResult>('init_all_baselines')
        this.batchProgress = result.completed
        this.batchTotal = result.total

        // 重新加载配置（绕过 init 的初始化检查，直接加载）
        const config = await configService.loadConfig()
        appStore.applyConfig(config)

        return result
      } catch (error) {
        console.error('初始化基准数据失败:', error)
        throw error
      } finally {
        this.batchOperating = false
        this.batchProgress = 0
        this.batchTotal = 0
      }
    },

    // 检测所有应用更新
    async checkAllUpdates() {
      await this.setupProgressListener()
      this.checkingUpdates = true
      this.updateCheckProgress = 0
      this.updateResults = []
      this.clearOperationLogs('update')

      try {
        const results = await invoke<UpdateCheckResult[]>('check_all_updates')
        this.updateResults = results
        this.updateCheckProgress = 100

        // 更新 appStore 中的更新状态
        const appStore = useAppStore()
        for (const result of results) {
          const app = appStore.config.apps[result.appId]
          if (app && app.updateMetadata) {
            app.updateMetadata.updateStatus = result.hasUpdate ? 'suspected' : 'none'
            app.updateMetadata.updateConfidence = result.confidence as any
            app.updateMetadata.lastCheckedAt = Date.now()
          }
        }
        await appStore.saveConfig()

        return results
      } catch (error) {
        console.error('更新检测失败:', error)
        throw error
      } finally {
        this.checkingUpdates = false
      }
    },

    // 批量删除失效应用
    async batchDeleteInvalidApps() {
      await this.setupProgressListener()
      const invalidAppIds = this.invalidApps.map(r => r.appId)
      if (invalidAppIds.length === 0) {
        return
      }

      this.batchOperating = true
      this.batchTotal = invalidAppIds.length
      this.batchProgress = 0
      this.clearOperationLogs('delete')

      try {
        const result = await invoke<BatchOperationResult>('batch_delete_apps', {
          appIds: invalidAppIds
        })

        // 重新加载配置（强制刷新前端状态）
        const appStore = useAppStore()
        await appStore.reloadConfig()

        // 清理验证结果
        this.validationResults = this.validationResults.filter(
          r => r.isValid
        )

        return result
      } catch (error) {
        console.error('批量删除失败:', error)
        throw error
      } finally {
        this.batchOperating = false
        this.batchProgress = 0
        this.batchTotal = 0
      }
    },

    async acceptCurrentBaseline(appIds: string[]) {
      const appStore = useAppStore()
      const targetIds = appIds.filter((appId, index) => appIds.indexOf(appId) === index)
      if (targetIds.length === 0) return { total: 0, completed: 0, succeeded: 0, failed: 0, errors: [] } satisfies BatchOperationResult

      this.batchOperating = true
      this.batchTotal = targetIds.length
      this.batchProgress = 0
      this.clearOperationLogs('baseline')

      const errors: BatchOperationResult['errors'] = []
      for (const appId of targetIds) {
        const app = appStore.config.apps[appId]
        try {
          await invoke('init_update_baseline', { appId })
          this.batchProgress++
          this.recordProgress({
            operation: 'baseline',
            appId,
            appName: app?.name,
            total: targetIds.length,
            completed: this.batchProgress,
            succeeded: this.batchProgress - errors.length,
            failed: errors.length,
            status: 'success',
            message: '已接受当前状态为新基准'
          })
        } catch (error) {
          errors.push({ appId, error: String(error) })
          this.batchProgress++
          this.recordProgress({
            operation: 'baseline',
            appId,
            appName: app?.name,
            total: targetIds.length,
            completed: this.batchProgress,
            succeeded: this.batchProgress - errors.length,
            failed: errors.length,
            status: 'failed',
            message: String(error)
          })
        }
      }

      const config = await configService.loadConfig()
      appStore.applyConfig(config)
      this.updateResults = this.updateResults.filter(result => !targetIds.includes(result.appId) || errors.some(error => error.appId === result.appId))

      this.batchOperating = false
      this.batchProgress = 0
      this.batchTotal = 0

      return {
        total: targetIds.length,
        completed: targetIds.length,
        succeeded: targetIds.length - errors.length,
        failed: errors.length,
        errors
      } satisfies BatchOperationResult
    },

    buildMaintenanceLogText() {
      const lines: string[] = [
        '程序维护日志',
        `导出时间：${formatDateTime(Date.now())}`,
        ''
      ]

      if (this.validationResults.length > 0) {
        lines.push('失效检测结果')
        lines.push(`总数：${this.validationResults.length}，失效：${this.invalidAppCount}`)
        for (const result of this.validationResults) {
          lines.push(`- ${result.isValid ? '正常' : '失效'} | ${result.appName} | ${result.reason || '验证通过'}`)
        }
        lines.push('')
      }

      if (this.updateResults.length > 0) {
        lines.push('更新检测结果')
        lines.push(`总数：${this.updateResults.length}，疑似更新：${this.updateCount}`)
        for (const result of this.updateResults) {
          const detail = result.details.oldVersion && result.details.newVersion
            ? `版本 ${result.details.oldVersion} -> ${result.details.newVersion}`
            : `文件变化=${result.details.fileChanged} 大小变化=${result.details.sizeChanged} 时间变化=${result.details.modifiedTimeChanged}`
          lines.push(`- ${result.hasUpdate ? '疑似更新' : '未更新'} | ${result.appName} | ${result.confidence} | ${detail}`)
        }
        lines.push('')
      }

      if (this.maintenanceLogs.length > 0) {
        lines.push('进度事件')
        for (const log of this.maintenanceLogs) {
          lines.push(`- ${formatDateTime(log.timestamp)} | ${operationLabels[log.operation]} | ${log.status} | ${log.completed}/${log.total} | ${log.appName || log.appId || '批量任务'} | ${log.message || ''}`)
        }
      }

      return lines.join('\n')
    },

    // 切换过滤器
    toggleShowOnlyInvalid() {
      this.showOnlyInvalid = !this.showOnlyInvalid
    },

    toggleShowOnlyUpdates() {
      this.showOnlyUpdates = !this.showOnlyUpdates
    },

    // 重置状态
    reset() {
      this.validationResults = []
      this.updateResults = []
      this.maintenanceLogs = []
      this.progressMessage = ''
      this.showOnlyInvalid = false
      this.showOnlyUpdates = false
    },
  }
})
