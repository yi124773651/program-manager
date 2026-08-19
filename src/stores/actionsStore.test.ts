import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import { useActionsStore } from './actionsStore'
import { persistenceService } from '@/services/persistenceService'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn()
}))

vi.mock('@/services/persistenceService', () => ({
  persistenceService: {
    load: vi.fn(),
    save: vi.fn()
  }
}))

const mockedInvoke = vi.mocked(invoke)
const mockedPersistenceService = vi.mocked(persistenceService)

describe('useActionsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockedInvoke.mockReset()
    mockedPersistenceService.load.mockReset()
    mockedPersistenceService.save.mockReset()
    mockedPersistenceService.load.mockResolvedValue({
      enabled: ['open_folder', 'unknown-action', { script: 'Get-Process' }],
      disabledLegacy: { powershell: '旧脚本动作已禁用' }
    })
    mockedPersistenceService.save.mockResolvedValue(undefined)
  })

  it('加载旧动作配置时只保留固定动作 ID 并清洗非法项', async () => {
    const store = useActionsStore()
    await store.init()

    expect(store.enabledActions).toEqual(['open_folder'])
    expect(store.enabledPresetActions.map(action => action.id)).toEqual(['open_folder'])
    expect(store.disabledLegacyActions).toEqual({ powershell: '旧脚本动作已禁用' })
    expect(mockedPersistenceService.save).toHaveBeenCalled()
  })

  it('审计记录只保留最近 200 条并持久化', async () => {
    const store = useActionsStore()
    await store.init()

    for (let index = 0; index < 205; index++) {
      await store.recordAudit({
        source: 'quick_action',
        actionId: 'copy_path',
        actionType: 'copy_path',
        status: 'success',
        confirmed: false,
        startedAt: index,
        endedAt: index + 1
      })
    }

    expect(store.auditEntries).toHaveLength(200)
    expect(mockedPersistenceService.save).toHaveBeenCalled()
  })
})
