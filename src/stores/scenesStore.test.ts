import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import { useScenesStore } from './scenesStore'
import type { Scene } from '@/types'
import { persistenceService } from '@/services/persistenceService'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  convertFileSrc: vi.fn((path: string) => path)
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn()
}))

vi.mock('@/services/persistenceService', () => ({
  persistenceService: {
    load: vi.fn(),
    save: vi.fn()
  }
}))

const mockedInvoke = vi.mocked(invoke)
const mockedPersistenceService = vi.mocked(persistenceService)

function makeScene(overrides: Partial<Scene> = {}): Scene {
  return {
    id: overrides.id ?? 'scene_1',
    name: overrides.name ?? '测试场景',
    icon: overrides.icon ?? '⚡',
    failureStrategy: overrides.failureStrategy ?? 'continue',
    actions: overrides.actions ?? [],
    createdAt: overrides.createdAt ?? 100,
    updatedAt: overrides.updatedAt ?? 100
  }
}

describe('useScenesStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockedInvoke.mockReset()
    mockedInvoke.mockResolvedValue(undefined)
    mockedPersistenceService.load.mockResolvedValue({ scenes: [] })
    mockedPersistenceService.save.mockResolvedValue(undefined)
    vi.useRealTimers()
  })

  it('失败策略为 continue 时会记录失败并继续后续动作', async () => {
    const store = useScenesStore()
    store.scenes = [
      makeScene({
        failureStrategy: 'continue',
        actions: [
          { id: 'bad_url', type: 'open_url', params: {} },
          { id: 'notify', type: 'notify', params: { message: '继续执行' } }
        ]
      })
    ]

    const result = await store.executeScene('scene_1')

    expect(result).toMatchObject({ success: true, completedActions: 1, totalActions: 2 })
    expect(store.latestExecutionScene).toBe('scene_1')
    expect(store.executionLogs.map((log) => log.status)).toEqual(['failed', 'success'])
    expect(mockedInvoke).toHaveBeenCalledTimes(1)
  })

  it('失败策略为 stop 时会中断后续动作并标记取消', async () => {
    const store = useScenesStore()
    store.scenes = [
      makeScene({
        failureStrategy: 'stop',
        actions: [
          { id: 'bad_url', type: 'open_url', params: {} },
          { id: 'notify', type: 'notify', params: { message: '不应执行' } }
        ]
      })
    ]

    const result = await store.executeScene('scene_1')

    expect(result).toMatchObject({ success: false, completedActions: 0, totalActions: 2 })
    expect(store.executionLogs.map((log) => log.status)).toEqual(['failed', 'cancelled'])
    expect(store.executionLogs[1].message).toBe('因失败策略中断')
    expect(mockedInvoke).not.toHaveBeenCalled()
  })

  it('取消延迟动作时会更新执行日志并复位执行状态', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-30T08:00:00'))

    const store = useScenesStore()
    store.scenes = [
      makeScene({
        actions: [
          { id: 'delay', type: 'delay', params: { seconds: 5 } },
          { id: 'notify', type: 'notify', params: { message: '不应执行' } }
        ]
      })
    ]

    const execution = store.executeScene('scene_1')
    await vi.advanceTimersByTimeAsync(100)
    store.cancelExecution()
    await vi.advanceTimersByTimeAsync(100)
    const result = await execution

    expect(result).toMatchObject({ success: false, cancelled: true, completedActions: 0, totalActions: 2 })
    expect(store.executionLogs.map((log) => log.status)).toEqual(['cancelled', 'cancelled'])
    expect(store.executing).toBe(false)
    expect(store.currentExecutingScene).toBeNull()
    expect(mockedInvoke).not.toHaveBeenCalled()
  })

  it('复制场景会生成新 ID 并复制动作列表', () => {
    const store = useScenesStore()
    store.scenes = [
      makeScene({
        actions: [
          { id: 'action_1', type: 'notify', params: { message: '原始动作' } }
        ]
      })
    ]

    const duplicated = store.duplicateScene('scene_1')

    expect(duplicated?.id).not.toBe('scene_1')
    expect(duplicated?.name).toBe('测试场景 副本')
    expect(duplicated?.actions).toHaveLength(1)
    expect(duplicated?.actions[0].id).not.toBe('action_1')
    expect(duplicated?.actions[0].params.message).toBe('原始动作')
    expect(mockedPersistenceService.save).toHaveBeenCalledWith('scenes', { scenes: store.scenes })
  })

  it('可以导出并导入单个场景 JSON', () => {
    const store = useScenesStore()
    store.scenes = [
      makeScene({
        actions: [
          { id: 'action_1', type: 'delay', params: { seconds: 2 } }
        ]
      })
    ]

    const exported = store.exportSceneJson('scene_1')
    const imported = store.importSceneJson(exported!)

    expect(imported.id).not.toBe('scene_1')
    expect(imported.name).toBe('测试场景')
    expect(imported.actions[0]).toMatchObject({ type: 'delay', params: { seconds: 2 } })
    expect(imported.actions[0].id).not.toBe('action_1')
  })

  it('导入无效动作类型时会拒绝写入', () => {
    const store = useScenesStore()
    const rawJson = JSON.stringify({
      name: '坏场景',
      icon: '⚡',
      actions: [{ id: 'bad', type: 'unknown', params: {} }]
    })

    expect(() => store.importSceneJson(rawJson)).toThrow('动作类型无效')
    expect(store.scenes).toHaveLength(0)
  })
})
