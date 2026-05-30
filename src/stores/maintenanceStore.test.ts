import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import { useAppStore } from './appStore'
import { useMaintenanceStore } from './maintenanceStore'
import { DEFAULT_CONFIG, type Config } from '@/types'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  convertFileSrc: vi.fn((path: string) => path)
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(vi.fn())
}))

const mockedInvoke = vi.mocked(invoke)

function makeConfig(): Config {
  return structuredClone(DEFAULT_CONFIG)
}

describe('useMaintenanceStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockedInvoke.mockReset()
  })

  it('未初始化数量只统计可执行程序条目', () => {
    const appStore = useAppStore()
    const maintenanceStore = useMaintenanceStore()

    appStore.config.apps = {
      browser: {
        id: 'browser',
        name: 'BitBrowser',
        path: 'C:\\Program Files\\BitBrowser\\bitbrowser.exe',
        category: 'browser',
        createdAt: Date.now(),
        itemType: 'app'
      },
      document: {
        id: 'document',
        name: '方案.docx',
        path: 'C:\\Users\\ming\\Documents\\方案.docx',
        category: 'browser',
        createdAt: Date.now(),
        itemType: 'file'
      },
      folder: {
        id: 'folder',
        name: '资料库',
        path: 'C:\\Users\\ming\\Documents\\资料库',
        category: 'browser',
        createdAt: Date.now(),
        itemType: 'folder'
      }
    } as any

    expect(maintenanceStore.uninitializedCount).toBe(1)
  })

  it('进度事件会更新对应进度并写入维护日志', () => {
    const maintenanceStore = useMaintenanceStore()

    maintenanceStore.recordProgress({
      operation: 'validation',
      appId: 'browser',
      appName: 'BitBrowser',
      total: 4,
      completed: 2,
      succeeded: 1,
      failed: 1,
      status: 'failed',
      message: '文件不存在'
    })

    expect(maintenanceStore.validationProgress).toBe(50)
    expect(maintenanceStore.progressMessage).toContain('BitBrowser')
    expect(maintenanceStore.maintenanceLogs).toHaveLength(1)
    expect(maintenanceStore.maintenanceLogs[0]).toMatchObject({
      operation: 'validation',
      appId: 'browser',
      status: 'failed'
    })
  })

  it('失效检测完成后会立即持久化验证状态', async () => {
    const appStore = useAppStore()
    const config = makeConfig()
    config.apps = {
      browser: {
        id: 'browser',
        name: 'BitBrowser',
        path: 'C:\\Program Files\\BitBrowser\\bitbrowser.exe',
        category: 'browser',
        createdAt: Date.now(),
        itemType: 'app'
      }
    }
    appStore.config = config

    mockedInvoke.mockImplementation(async (command) => {
      if (command === 'validate_all_apps') {
        return [{
          appId: 'browser',
          appName: 'BitBrowser',
          isValid: false,
          reason: '文件不存在',
          pathType: 'local'
        }]
      }
      return undefined
    })

    const maintenanceStore = useMaintenanceStore()

    await maintenanceStore.validateAllApps()

    expect(appStore.config.apps.browser.validationStatus).toBe('invalid')
    expect(mockedInvoke).toHaveBeenCalledWith('save_config', { config: appStore.config })
  })

  it('更新检测完成后会立即持久化更新状态', async () => {
    const appStore = useAppStore()
    const config = makeConfig()
    config.apps = {
      browser: {
        id: 'browser',
        name: 'BitBrowser',
        path: 'C:\\Program Files\\BitBrowser\\bitbrowser.exe',
        category: 'browser',
        createdAt: Date.now(),
        itemType: 'app',
        updateMetadata: {
          baselineVersion: '1.0.0',
          baselineFileSize: 1024,
          baselineModifiedTime: 1,
          lastCheckedAt: 1,
          updateStatus: 'none'
        }
      }
    }
    appStore.config = config

    mockedInvoke.mockImplementation(async (command) => {
      if (command === 'check_all_updates') {
        return [{
          appId: 'browser',
          appName: 'BitBrowser',
          hasUpdate: true,
          confidence: 'high',
          details: {
            oldVersion: '1.0.0',
            newVersion: '1.1.0',
            fileChanged: true,
            sizeChanged: true,
            modifiedTimeChanged: true
          }
        }]
      }
      return undefined
    })

    const maintenanceStore = useMaintenanceStore()

    await maintenanceStore.checkAllUpdates()

    expect(appStore.config.apps.browser.updateMetadata?.updateStatus).toBe('suspected')
    expect(mockedInvoke).toHaveBeenCalledWith('save_config', { config: appStore.config })
  })

  it('接受当前状态为基准会逐项调用后端并清理成功项更新结果', async () => {
    const appStore = useAppStore()
    const config = makeConfig()
    config.apps = {
      browser: {
        id: 'browser',
        name: 'BitBrowser',
        path: 'C:\\Program Files\\BitBrowser\\bitbrowser.exe',
        category: 'browser',
        createdAt: Date.now(),
        itemType: 'app'
      }
    }
    appStore.config = config

    mockedInvoke.mockImplementation(async (command) => {
      if (command === 'load_config') return config
      return undefined
    })

    const maintenanceStore = useMaintenanceStore()
    maintenanceStore.updateResults = [{
      appId: 'browser',
      appName: 'BitBrowser',
      hasUpdate: true,
      confidence: 'medium',
      details: {
        fileChanged: true,
        sizeChanged: true,
        modifiedTimeChanged: true
      }
    }]

    const result = await maintenanceStore.acceptCurrentBaseline(['browser'])

    expect(mockedInvoke).toHaveBeenCalledWith('init_update_baseline', { appId: 'browser' })
    expect(result).toMatchObject({ total: 1, succeeded: 1, failed: 0 })
    expect(maintenanceStore.updateResults).toHaveLength(0)
    expect(maintenanceStore.maintenanceLogs[0].message).toBe('已接受当前状态为新基准')
  })

  it('维护日志文本会包含检测结果和更新结果', () => {
    const maintenanceStore = useMaintenanceStore()
    maintenanceStore.validationResults = [{
      appId: 'missing',
      appName: '缺失程序',
      isValid: false,
      reason: '文件不存在',
      pathType: 'local'
    }]
    maintenanceStore.updateResults = [{
      appId: 'updated',
      appName: '已更新程序',
      hasUpdate: true,
      confidence: 'high',
      details: {
        oldVersion: '1.0.0',
        newVersion: '1.1.0',
        fileChanged: true,
        sizeChanged: false,
        modifiedTimeChanged: true
      }
    }]

    const logText = maintenanceStore.buildMaintenanceLogText()

    expect(logText).toContain('程序维护日志')
    expect(logText).toContain('缺失程序')
    expect(logText).toContain('已更新程序')
    expect(logText).toContain('1.0.0 -> 1.1.0')
  })
})
