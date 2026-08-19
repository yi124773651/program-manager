import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sceneService } from './sceneService'
import { persistenceService } from '@/services/persistenceService'
import type { Scene } from '@/types'

vi.mock('@/services/persistenceService', () => ({
  persistenceService: {
    load: vi.fn(),
    save: vi.fn(),
    backup: vi.fn()
  }
}))

const mockedPersistenceService = vi.mocked(persistenceService)

function makeScene(overrides: Partial<Scene> = {}): Scene {
  return {
    id: overrides.id ?? 'scene_1',
    name: overrides.name ?? '测试场景',
    icon: overrides.icon ?? '⚡',
    failureStrategy: overrides.failureStrategy ?? 'continue',
    actions: overrides.actions ?? [
      { id: 'action_1', type: 'delay', params: { seconds: 2 } }
    ],
    createdAt: overrides.createdAt ?? 100,
    updatedAt: overrides.updatedAt ?? 100
  }
}

describe('sceneService', () => {
  beforeEach(() => {
    mockedPersistenceService.load.mockReset()
    mockedPersistenceService.save.mockReset()
    mockedPersistenceService.backup.mockReset()
    mockedPersistenceService.backup.mockResolvedValue('D:\\backup\\sanitize-scenes')
    vi.useRealTimers()
  })

  it('从统一持久化服务读取场景列表', async () => {
    const scene = makeScene()
    mockedPersistenceService.load.mockResolvedValue({ scenes: [scene] })

    await expect(sceneService.loadScenes()).resolves.toEqual([scene])
    expect(mockedPersistenceService.load).toHaveBeenCalledWith('scenes', { scenes: [] })
  })

  it('保存场景时使用统一 scenes 数据包', async () => {
    const scenes = [makeScene()]

    await sceneService.saveScenes(scenes)

    expect(mockedPersistenceService.save).toHaveBeenCalledWith('scenes', { scenes })
  })

  it('复制场景会生成新场景和新动作 ID', () => {
    const duplicated = sceneService.duplicateScene(makeScene())

    expect(duplicated.id).not.toBe('scene_1')
    expect(duplicated.name).toBe('测试场景 副本')
    expect(duplicated.actions[0].id).not.toBe('action_1')
    expect(duplicated.actions[0]).toMatchObject({ type: 'delay', params: { seconds: 2 } })
  })

  it('导入场景 JSON 会校验动作类型并重建 ID', () => {
    const imported = sceneService.importSceneJson(JSON.stringify(makeScene()))

    expect(imported.id).not.toBe('scene_1')
    expect(imported.name).toBe('测试场景')
    expect(imported.actions[0].id).not.toBe('action_1')
    expect(imported.actions[0]).toMatchObject({ type: 'delay', params: { seconds: 2 } })
  })

  it('导入无效场景 JSON 时会给出明确错误', () => {
    expect(() => sceneService.importSceneJson('{bad')).toThrow('场景 JSON 格式无效')
    expect(() => sceneService.importSceneJson(JSON.stringify({ name: '坏场景', actions: [{ type: 'unknown' }] })))
      .toThrow('动作类型无效')
    expect(() => sceneService.importSceneJson(JSON.stringify({ name: '坏场景', failureStrategy: 'bad', actions: [] })))
      .toThrow('场景失败策略无效')
  })

  it('导入场景会拒绝脚本字段、非法网址和危险路径', () => {
    const scriptScene = sceneService.importSceneJson(JSON.stringify({
      name: '脚本场景',
      actions: [{ type: 'open_url', params: { url: 'https://example.com', scriptContent: 'Start-Process calc' } }]
    }))
    expect(scriptScene.actions[0]).toMatchObject({ disabled: true, disabledReason: expect.stringContaining('脚本') })

    expect(() => sceneService.importSceneJson(JSON.stringify({
      name: '网址场景',
      actions: [{ type: 'open_url', params: { url: 'javascript:alert(1)' } }]
    }))).toThrow('动作参数无效')

    expect(() => sceneService.importSceneJson(JSON.stringify({
      name: '路径场景',
      actions: [{ type: 'open_file', params: { path: 'relative.txt' } }]
    }))).toThrow('动作参数无效')
  })

  it('加载旧场景会将无法安全迁移的动作标记为禁用', async () => {
    mockedPersistenceService.load.mockResolvedValue({
      scenes: [{
        id: 'legacy-scene',
        name: '旧场景',
        actions: [
          { id: 'legacy-script', type: 'powershell', params: { script: 'Get-Process' } },
          { id: 'legacy-delay', type: 'delay', params: { seconds: 3, unknownField: 'drop-me' } }
        ]
      }]
    })

    const scenes = await sceneService.loadScenes()
    expect(scenes).toHaveLength(1)
    expect(scenes[0].actions[0]).toMatchObject({ disabled: true, legacyType: 'powershell' })
    expect(scenes[0].actions[1]).toMatchObject({ type: 'delay', params: { seconds: 3 } })
    expect(scenes[0].actions[1].params).not.toHaveProperty('unknownField')
    expect(mockedPersistenceService.backup).toHaveBeenCalledWith('scenes', '清洗旧场景动作配置前自动备份')
    expect(mockedPersistenceService.save).toHaveBeenCalledWith('scenes', { scenes })
  })

  it('加载已清洗场景不会重复备份或回写', async () => {
    const scene = makeScene()
    mockedPersistenceService.load.mockResolvedValue({ scenes: [scene] })

    await sceneService.loadScenes()

    expect(mockedPersistenceService.backup).not.toHaveBeenCalled()
    expect(mockedPersistenceService.save).not.toHaveBeenCalled()
  })
})
