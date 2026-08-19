import { defineStore } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import {
  PRESET_ACTIONS,
  DEFAULT_ENABLED_ACTIONS,
  type ActionTemplate,
  type ActionAuditEntry
} from '@/types'
import { persistenceService } from '@/services/persistenceService'
import { clipboardAdapter } from '@/adapters/clipboardAdapter'

interface ActionsStorage {
  enabled?: unknown
  disabledLegacy?: Record<string, string>
  audit?: unknown
}

export const useActionsStore = defineStore('actions', {
  state: () => ({
    enabledActions: [...DEFAULT_ENABLED_ACTIONS.enabled] as string[],
    disabledLegacyActions: {} as Record<string, string>,
    auditEntries: [] as ActionAuditEntry[],
    initialized: false,
    executing: false
  }),

  getters: {
    // 获取所有启用的预设动作
    enabledPresetActions(): ActionTemplate[] {
      return PRESET_ACTIONS.filter(a => this.enabledActions.includes(a.id))
        .sort((a, b) => a.order - b.order)
    },

    // 检查动作是否启用
    isActionEnabled(): (id: string) => boolean {
      return (id: string) => this.enabledActions.includes(id)
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
        const config = await persistenceService.load<ActionsStorage>('actions', {
          enabled: DEFAULT_ENABLED_ACTIONS.enabled
        })
        const allowedIds = new Set(PRESET_ACTIONS.map(action => action.id))
        const configured = Array.isArray(config.enabled) ? config.enabled : []
        const validEnabled = configured.filter((id): id is string => typeof id === 'string' && allowedIds.has(id))
        this.enabledActions = Array.isArray(config.enabled)
          ? validEnabled
          : [...DEFAULT_ENABLED_ACTIONS.enabled]
        this.disabledLegacyActions = Object.fromEntries(
          Object.entries(config.disabledLegacy || {}).filter(([key, value]) =>
            typeof key === 'string' && typeof value === 'string' && key.length <= 128 && value.length <= 200
          )
        )
        this.auditEntries = Array.isArray(config.audit)
          ? config.audit.filter((entry): entry is ActionAuditEntry => {
              if (!entry || typeof entry !== 'object') return false
              const value = entry as Partial<ActionAuditEntry>
              return typeof value.id === 'string' && typeof value.actionId === 'string' &&
                typeof value.actionType === 'string' && typeof value.status === 'string' &&
                typeof value.startedAt === 'number' && typeof value.endedAt === 'number'
            }).slice(0, 200)
          : []
        if (configured.some(id => typeof id !== 'string' || !allowedIds.has(id))) {
          await this.saveConfig()
        }
      } catch (error) {
        console.error('加载动作配置失败:', error)
      }
    },

    // 保存配置到统一 JSON 文件
    async saveConfig() {
      const config = {
        enabled: [...new Set(this.enabledActions)].filter(id => PRESET_ACTIONS.some(action => action.id === id)),
        disabledLegacy: this.disabledLegacyActions,
        audit: this.auditEntries
      }
      await persistenceService.save('actions', config)
    },

    // 启用/禁用动作
    toggleAction(actionId: string) {
      const index = this.enabledActions.indexOf(actionId)
      if (index >= 0) {
        this.enabledActions.splice(index, 1)
      } else {
        this.enabledActions.push(actionId)
      }
      void this.saveConfig()
    },

    async recordAudit(entry: Omit<ActionAuditEntry, 'id'>) {
      if (!this.initialized) {
        await this.init()
      }
      const record: ActionAuditEntry = {
        ...entry,
        id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      }
      this.auditEntries.unshift(record)
      this.auditEntries = this.auditEntries.slice(0, 200)
      try {
        await this.saveConfig()
      } catch (error) {
        console.error('保存动作审计日志失败:', error)
      }
    },

    // 执行动作
    async executeAction(
      actionId: string,
      appPath: string,
      _appName: string,
      confirmed = false
    ): Promise<{ success: boolean; output: string; errorOutput: string }> {
      this.executing = true

      try {
        // 查找预设动作
        const presetAction = PRESET_ACTIONS.find(action => action.id === actionId)

        if (presetAction) {
          if (actionId === 'open_folder') {
            await invoke('open_file_location', { filePath: appPath })
            return { success: true, output: '', errorOutput: '' }
          }

          if (actionId === 'copy_path') {
            await clipboardAdapter.writeText(appPath)
            return { success: true, output: `已复制: ${appPath}`, errorOutput: '' }
          }

          // 只执行后端登记的固定动作，不向后端传递脚本源码。
          const result = await invoke<{
            success: boolean
            output: string
            errorOutput: string
            exitCode: number
            executionTime: number
          }>('execute_app_action', {
            actionId: presetAction.id,
            appPath,
            confirmed
          })

          return {
            success: result.success,
            output: result.output,
            errorOutput: result.errorOutput
          }
        }

        return {
          success: false,
          output: '',
          errorOutput: '动作不存在'
        }
      } catch (error) {
        return {
          success: false,
          output: '',
          errorOutput: String(error)
        }
      } finally {
        this.executing = false
      }
    },

    // 重置为默认配置
    resetToDefault() {
      this.enabledActions = [...DEFAULT_ENABLED_ACTIONS.enabled]
      void this.saveConfig()
    }
  }
})
