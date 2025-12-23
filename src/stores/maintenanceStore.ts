import { defineStore } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import { useAppStore } from './appStore'
import type { ValidationResult, UpdateCheckResult, BatchOperationResult, Config } from '@/types'

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
        if (!app.updateMetadata) {
          count++
        }
      }
      return count
    },
  },

  actions: {
    // 验证所有应用
    async validateAllApps() {
      this.validating = true
      this.validationProgress = 0
      this.validationResults = []

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
        await appStore.debouncedSaveConfig()

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
      const appStore = useAppStore()
      const appIds = Object.keys(appStore.config.apps)
      const total = appIds.length

      this.batchOperating = true
      this.batchProgress = 0
      this.batchTotal = total

      try {
        const result = await invoke<BatchOperationResult>('init_all_baselines')
        this.batchProgress = result.completed
        this.batchTotal = result.total

        // 重新加载配置（绕过 init 的初始化检查，直接加载）
        const config = await invoke<Config>('load_config')
        appStore.config = config

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
      this.checkingUpdates = true
      this.updateCheckProgress = 0
      this.updateResults = []

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
        await appStore.debouncedSaveConfig()

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
      const invalidAppIds = this.invalidApps.map(r => r.appId)
      if (invalidAppIds.length === 0) {
        return
      }

      this.batchOperating = true
      this.batchTotal = invalidAppIds.length
      this.batchProgress = 0

      try {
        const result = await invoke<BatchOperationResult>('batch_delete_apps', {
          appIds: invalidAppIds
        })

        // 重新加载配置
        const appStore = useAppStore()
        await appStore.init()

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
      this.showOnlyInvalid = false
      this.showOnlyUpdates = false
    },
  }
})
