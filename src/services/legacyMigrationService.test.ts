import { beforeEach, describe, expect, it, vi } from 'vitest'
import { tauriAdapter } from '@/adapters/tauriAdapter'
import { legacyMigrationService } from './legacyMigrationService'

vi.mock('@/adapters/tauriAdapter', () => ({
  tauriAdapter: {
    getLegacyDataStatus: vi.fn(),
    migrateLegacyLocalStorage: vi.fn()
  }
}))

const mockedTauriAdapter = vi.mocked(tauriAdapter)
const storage: Record<string, string> = {}

const localStorageMock = {
  getItem: vi.fn((key: string) => storage[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    storage[key] = value
  }),
  removeItem: vi.fn((key: string) => {
    delete storage[key]
  })
}

describe('legacyMigrationService', () => {
  beforeEach(() => {
    Object.keys(storage).forEach((key) => delete storage[key])
    vi.stubGlobal('localStorage', localStorageMock)
    mockedTauriAdapter.getLegacyDataStatus.mockResolvedValue({
      migrationId: 'local-storage-to-json-v1',
      alreadyCompleted: false,
      hasScenes: false,
      hasNotes: false,
      hasTodos: false,
      hasClipboard: false,
      hasActions: false
    })
    mockedTauriAdapter.migrateLegacyLocalStorage.mockResolvedValue({
      migrationId: 'local-storage-to-json-v1',
      success: true,
      skipped: false,
      writtenFiles: [],
      errors: []
    })
  })

  it('会采集可解析的旧 localStorage，并保留原始内容用于后端备份', () => {
    storage.app_scenes_config = JSON.stringify({ scenes: [{ id: 'scene-1' }] })
    storage.quick_notes = JSON.stringify({ notes: [{ id: 'note-1' }] })

    const payload = legacyMigrationService.collectPayload()

    expect(payload.scenes).toEqual({ scenes: [{ id: 'scene-1' }] })
    expect(payload.notes).toEqual({ notes: [{ id: 'note-1' }] })
    expect(payload.legacyRaw?.app_scenes_config).toBe(storage.app_scenes_config)
  })

  it('旧数据解析失败时会记录错误，不删除旧 localStorage', () => {
    storage.todo_schedule = '{bad json'

    const payload = legacyMigrationService.collectPayload()

    expect(payload.todos).toBeUndefined()
    expect(payload.frontendErrors?.[0]).toContain('todo_schedule')
    expect(localStorageMock.removeItem).not.toHaveBeenCalled()
  })

  it('后端已完成迁移时不会重复提交迁移', async () => {
    storage.clipboard_history = JSON.stringify({ items: [] })
    mockedTauriAdapter.getLegacyDataStatus.mockResolvedValueOnce({
      migrationId: 'local-storage-to-json-v1',
      alreadyCompleted: true,
      hasScenes: false,
      hasNotes: false,
      hasTodos: false,
      hasClipboard: true,
      hasActions: false
    })

    const result = await legacyMigrationService.migrateIfNeeded()

    expect(result).toBeNull()
    expect(mockedTauriAdapter.migrateLegacyLocalStorage).not.toHaveBeenCalled()
  })
})
