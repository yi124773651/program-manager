import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from './appStore'
import { useMaintenanceStore } from './maintenanceStore'

describe('useMaintenanceStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
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
})
