import { defineStore } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import {
  PRESET_ACTIONS,
  DEFAULT_ENABLED_ACTIONS,
  getActionTemplate,
  type ActionTemplate
} from '@/types'

const STORAGE_KEY = 'app_actions_config'

export const useActionsStore = defineStore('actions', {
  state: () => ({
    enabledActions: [...DEFAULT_ENABLED_ACTIONS.enabled] as string[],
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
    // 初始化 - 从 localStorage 加载配置
    init() {
      if (this.initialized) return

      try {
        const saved = localStorage.getItem(STORAGE_KEY)
        if (saved) {
          const config = JSON.parse(saved)
          this.enabledActions = config.enabled || DEFAULT_ENABLED_ACTIONS.enabled
        }
      } catch (error) {
        console.error('加载动作配置失败:', error)
      }

      this.initialized = true
    },

    // 保存配置到 localStorage
    saveConfig() {
      const config = {
        enabled: this.enabledActions
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
    },

    // 启用/禁用动作
    toggleAction(actionId: string) {
      const index = this.enabledActions.indexOf(actionId)
      if (index >= 0) {
        this.enabledActions.splice(index, 1)
      } else {
        this.enabledActions.push(actionId)
      }
      this.saveConfig()
    },

    // 执行动作
    async executeAction(
      actionId: string,
      appPath: string,
      appName: string
    ): Promise<{ success: boolean; output: string; errorOutput: string }> {
      this.executing = true

      try {
        // 查找预设动作
        const presetAction = getActionTemplate(actionId)

        if (presetAction) {
          // 执行预设动作的脚本模板
          const result = await invoke<{
            success: boolean
            output: string
            errorOutput: string
            exitCode: number
            executionTime: number
          }>('execute_action_template', {
            scriptContent: presetAction.scriptTemplate,
            appPath,
            appName
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
      this.saveConfig()
    }
  }
})
